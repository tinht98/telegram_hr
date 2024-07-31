const { Telegraf } = require('telegraf')
const mongoose = require('mongoose')
const { Readable } = require('stream');

const { connect, Schema } = mongoose
let { MONGO_SRV_URL, TELEGRAM_BOT_TOKEN } = process.env

TELEGRAM_BOT_TOKEN = '6730362518:AAGbVJs3WH2VOoTNxh38gdTxbhMZTiodpyw' // TODO: Remove

const dbConnection = async () => {
  try {
    const options = {
      connectTimeoutMS: 30000,
      readPreference: 'primaryPreferred', // primary also will make mongoose auto create indexes in collections
      useUnifiedTopology: true,
      useNewUrlParser: true
    }

    await connect(MONGO_SRV_URL || '', options)

    mongoose.connection.on('error', error => {
      console.error('Error connecting to database', error)
      mongoose.connection.close()
    })

    mongoose.connection.on('disconnected', () => {
      console.log('Disconnected from database')
    })

    console.log('Database connected')
  } catch (error) {
    console.error('Error connecting to database', error)
    await mongoose.connection.close()
  }
}

const TelegramUserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    first_name: { type: String },
    last_name: { type: String },
    username: { type: String },
    image: { type: String }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramChatSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    invite_link: { type: String }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramUserJoinChatSchema = new Schema(
  {
    user_id: { type: String, required: true },
    chat_id: { type: String, required: true },
    status: { type: String, required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramUserModel = mongoose.model('TelegramUser', TelegramUserSchema)
const TelegramChatModel = mongoose.model('TelegramChat', TelegramChatSchema)
const TelegramUserJoinChatModel = mongoose.model('TelegramUserJoinChat', TelegramUserJoinChatSchema)

const CommandKeys = {
  'I_AM_BUILDER': 'iambuilder',
  'GET_INVITE_LINKS': 'getinvitelinks',
  'GET_LIST_BUILDERS': 'getlistbuilders',
  'GET_LIST_CHANNELS': 'getlistchannels',
  'REMOVE_BUILDER': 'removebuilder',
  'GET_CHAT_MEMBERS_COUNT': 'getchatmemberscount',
  'GET_LIST_BUILDERS_CSV': 'getlistbuilderscsv',
}

const commands = [
  {
    command: CommandKeys.GET_INVITE_LINKS,
    description: 'Get invite links of all channels'
  },
  {
    command: CommandKeys.GET_LIST_CHANNELS,
    description: 'Get list of all channels'
  },
  {
    command: CommandKeys.REMOVE_BUILDER,
    description: 'Remove builder from all channels'
  },
  {
    command: CommandKeys.GET_LIST_BUILDERS,
    description: 'Get list of all builders'
  },
  {
    command: CommandKeys.GET_CHAT_MEMBERS_COUNT,
    description: 'Get the number of members in a chat'
  },
  {
    command: CommandKeys.I_AM_BUILDER,
    description: 'Add yourself to list of builders'
  },
  {
    command: CommandKeys.GET_LIST_BUILDERS_CSV,
    description: 'Get list of all builders in CSV format'
  },
]

class TelegramService {
  bot
  userStates = {} // In-memory state to track user conversations

  constructor() {
    this.bot = new Telegraf(TELEGRAM_BOT_TOKEN)

    this.bot.start(ctx => ctx.reply('Welcome'))
    this.bot.hears('hi', ctx => ctx.reply('Hey there'))

    // Add commands
    this.bot.telegram.setMyCommands(commands)

    // Handle commands
    this.bot.command(CommandKeys.GET_LIST_CHANNELS, this.commandGetListChannels.bind(this))
    this.bot.command(CommandKeys.GET_INVITE_LINKS, this.commandGetInviteLinks.bind(this))
    this.bot.command(CommandKeys.REMOVE_BUILDER, this.commandRemoveBuilder.bind(this))
    this.bot.command(CommandKeys.GET_LIST_BUILDERS, this.commandGetListBuilders.bind(this))
    this.bot.command(CommandKeys.GET_CHAT_MEMBERS_COUNT, this.commandGetChatMembersCount.bind(this))
    this.bot.command(CommandKeys.I_AM_BUILDER, this.commandIamBuilder.bind(this))
    this.bot.command(CommandKeys.GET_LIST_BUILDERS_CSV, this.getListBuildersCsv.bind(this))

    // Builder management
    this.bot.on('my_chat_member', this.myChatMember.bind(this))
    this.bot.on('new_chat_members', this.newChatMembers.bind(this))
    this.bot.on('left_chat_member', this.leftChatMember.bind(this))

    // User replies to the bot
    this.bot.on('text', this.processReply.bind(this))

    this.bot.launch()
  }

  async commandGetListChannels(ctx) {
    try {
      const channels = await TelegramChatModel.find()
      const makeLine = (channel, index) => `${index + 1}/ ${channel.title}`
      ctx.reply(`Channels:\n\n${channels.map(makeLine).join('\n')}
    `)
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandGetInviteLinks(ctx) {
    try {
      const channels = await TelegramChatModel.find({}, { id: 1, title: 1, invite_link: 1 })
      const links = []
      for (const channel of channels) {
        if (!channel.invite_link) {
          channel.invite_link = await this.bot.telegram.exportChatInviteLink(channel.id)
          await TelegramChatModel.updateOne({ id: channel.id }, { invite_link: channel.invite_link })
        }
        links.push({ name: channel.title, link: channel.invite_link })
      }

      const makeLine = (item, index) => ` ${index + 1}/ ${item.name}: ${item.link}`
      ctx.reply(`Open the following links to join the channels:\n${links.map(makeLine).join('\n')}`)
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandGetListBuilders(ctx) {
    try {
      const builders = await TelegramUserModel.find({ is_bot: { $ne: true } })
      const makeLine = (builder, index) => `${index + 1}/ @${builder.username}: ${builder.first_name ?? ''} ${builder.last_name ?? ''} - ID: ${builder.id}`
      ctx.reply(`
      Builders:\n\n${builders.map(makeLine).join('\n')}
    `)
    } catch (error) {
      console.log('error', error)
    }
  }

  async getListBuildersCsv(ctx) {
    try {
      const builders = await TelegramUserModel.find({ is_bot: { $ne: true } }).lean()
      const header = 'ID,User Name, First Name, Last Name\n'
      const csv = builders.map(builder => `${builder.id},@${builder.username || ''},${builder.first_name || ''},${builder.last_name || ''}`).join('\n')
      const csvWithHeader = header + csv
      const csvStream = this.createStreamFromString(csvWithHeader);

      // Send the CSV file as a document
      await ctx.replyWithDocument({
        source: csvStream,
        filename: 'list_builders.csv'
      });
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandGetChatMembersCount(ctx) {
    try {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the group name')
      this.userStates[ctx.from.id] = { stage: CommandKeys.GET_CHAT_MEMBERS_COUNT }
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandIamBuilder(ctx) {
    try {
      const channels = await TelegramChatModel.find({}, { id: 1 })
      for (const channel of channels) {
        // Add new user
        TelegramUserModel.create({
          id: ctx.from.id,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username,
        }).catch(() => {
          console.log('🔥 ~ TelegramService ~ commandAddMeToChannels ~ error adding user')
        })

        // Add user to chat id
        TelegramUserJoinChatModel.create(
          {
            user_id: ctx.from.id,
            chat_id: channel.id,
            status: 'joined'
          },
          { upsert: true }
        ).catch(() => {
          console.log('🔥 ~ TelegramService ~ commandAddMeToChannels ~ error adding user to chat')
        })

      }
      // send private message to user
      await this.bot.telegram.sendMessage(ctx.from.id, `Welcome to Ninety Eight, have a great time!`)
    } catch (error) {
      console.log('error-commandAddMeToChannels', error)
    }
  }

  /**
   * Admin will chat `@user_name` to the bot, then the bot will remove the user from the database and ban the user from all channels
   * @param ctx
   */
  async commandRemoveBuilder(ctx) {
    try {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the `ID` of the builder you want to remove')
      this.userStates[ctx.from.id] = { stage: CommandKeys.REMOVE_BUILDER }
    } catch (error) {
      console.log('error', error)
    }
  }

  /**
   * This event is triggered when the bot's status in a chat changes.
   * The `ctx.myChatMember.new_chat_member.status` property indicates the new status of the bot
   * (e.g., member when `creator` | `administrator` | `member` | `restricted` | `left` | `kicked`)
   * @param ctx
   */
  async myChatMember(ctx) {
    try {
      const status = ctx.myChatMember.new_chat_member.status
      console.log('~ TelegramService ~ botOnChatMember ~ status:', status, 'chat:', ctx.chat)
      switch (status) {
        case 'member':
          TelegramChatModel.create({
            id: ctx.chat.id,
            title: ctx.chat.title,
            type: ctx.chat.type
          }).catch(() => {
            console.log('🔥 ~ TelegramService ~ botOnChatMember ~ error adding chat')
          })
          break
        case 'left':
          TelegramChatModel.deleteOne({ id: ctx.chat.id })
          break
      }
    } catch (error) {
      console.log('error', error)
    }
  }

  async newChatMembers(ctx) {
    try {
      console.log('~ TelegramService ~ newChatMembers ~ ctx:', ctx.message)
      for (const member of ctx.message.new_chat_members) {
        TelegramUserModel.create({
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          username: member.username,
          is_bot: member.is_bot
        }).catch(() => {
          console.log('🔥 ~ TelegramService ~ newChatMembers ~ error adding user')
        })

        TelegramUserJoinChatModel.create(
          {
            user_id: member.id,
            chat_id: ctx.chat.id,
            status: 'joined'
          },
          { upsert: true }
        ).catch(() => {
          console.log('🔥 ~ TelegramService ~ newChatMembers ~ error adding user to chat')
        })
      }
    } catch (error) {
      console.log('error', error)
    }
  }

  async leftChatMember(ctx) {
    try {
      console.log('~ TelegramService ~ leftChatMember ~ ctx:', ctx.message)
      TelegramUserModel.deleteOne({ id: ctx.message.left_chat_member.id })
      TelegramUserJoinChatModel.updateOne({ user_id: ctx.message.left_chat_member.id, chat_id: ctx.chat.id }, { status: 'removed' })
    } catch (error) {
      console.log('error', error)
    }
  }

  async processReply(ctx) {
    try {
      const state = this.userStates[ctx.from.id]
      if (state) {
        switch (state.stage) {
          case CommandKeys.REMOVE_BUILDER:
            console.log('🔥 ~ TelegramService ~ constructor ~ ctx.message.text:', ctx.message)
            await this.removeBuilder(ctx)
            break
          case CommandKeys.GET_CHAT_MEMBERS_COUNT:
            await this.getChatMembersCount(ctx)
            break
        }
      }
      // Clear user's state after processing
      this.userStates[ctx.from.id] = undefined
    } catch (error) {
      console.log('error', error)
    }
  }

  async removeBuilder(ctx) {
    try {
      const builderId = ctx.message.text
      const builder = await TelegramUserModel.findOne({ id: builderId })
      const chats = await TelegramChatModel.find({}, { id: 1 })
      const chatIds = chats.map(chat => chat.id)
      if (!builder) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'Builder not found')
      } else {
        for (const chatId of chatIds) {
          await TelegramUserJoinChatModel.deleteMany({ user_id: builder.id, chat_id: chatId })
          this.bot.telegram.banChatMember(chatId, builder.id).catch(() => {
            console.log('🔥 ~ TelegramService ~ removeBuilder ~ error banning user')
          })
        }
        await TelegramUserModel.deleteOne({ id: builder.id })
        await this.bot.telegram.sendMessage(ctx.chat.id, `Builder \`@${builder.username}\` has been removed from all channels`)
      }
    } catch (error) {
      console.log('error', error)
    }
  }

  async getChatMembersCount(ctx) {
    try {
      console.log('🔥 ~ TelegramService ~ constructor ~ ctx.message.text:', ctx.message)
      const text = await TelegramChatModel.findOne({ title: ctx.message.text })
      if (text) {
        const result = await this.bot.telegram.getChatMembersCount(text.id)
        await this.bot.telegram.sendMessage(ctx.chat.id, `The number of members in the chat is ${result}`)
      } else {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'Chat not found')
      }
    } catch (error) {
      console.log('error', error)
    }
  }

  _extractMentionedUser(text) {
    const mentionPattern = /@(\w+)/
    const match = text.match(mentionPattern)
    return match ? match[1] : null
  }

  // Function to create a readable stream from a string
  createStreamFromString(content) {
    const readable = new Readable();
    readable._read = () => { }; // _read is required but you can noop it
    readable.push(content);
    readable.push(null); // Signal end of data
    return readable;
  }
}

const main = async () => {
  await dbConnection()
  new TelegramService()
}

main()
