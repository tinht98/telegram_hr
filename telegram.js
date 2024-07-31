const { Telegraf } = require('telegraf')
const mongoose = require('mongoose')
const { Readable } = require('stream');

const { connect, Schema } = mongoose
let { MONGO_SRV_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_OWNER_ID } = process.env

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

const TelegramBotAdminSchema = new Schema(
  {
    user_id: { type: String, required: true },
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    username: { type: String, required: true },
    role: { type: String, required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramUserModel = mongoose.model('TelegramUser', TelegramUserSchema)
const TelegramChatModel = mongoose.model('TelegramChat', TelegramChatSchema)
const TelegramUserJoinChatModel = mongoose.model('TelegramUserJoinChat', TelegramUserJoinChatSchema)
const TelegramBotAdminModel = mongoose.model('TelegramBotAdmin', TelegramBotAdminSchema)

const CommandKeys = {
  'I_AM_BUILDER': 'iambuilder',
  'GET_INVITE_LINKS': 'getinvitelinks',
  'GET_LIST_BUILDERS': 'getlistbuilders',
  'GET_LIST_CHANNELS': 'getlistchannels',
  'REMOVE_BUILDER': 'removebuilder',
  'GET_CHAT_MEMBERS_COUNT': 'getchatmemberscount',
  'GET_LIST_BUILDERS_CSV': 'getlistbuilderscsv',
}



class TelegramService {
  bot
  userStates = {} // In-memory state to track user conversations

  COMMANDS = [
    {
      command: CommandKeys.GET_INVITE_LINKS,
      description: 'Get invite links of all channels',
      handler: this.commandGetInviteLinks.bind(this)
    },
    {
      command: CommandKeys.GET_LIST_CHANNELS,
      description: 'Get list of all channels',
      handler: this.commandGetListChannels.bind(this)
    },
    {
      command: CommandKeys.REMOVE_BUILDER,
      description: 'Remove builder from all channels',
      handler: this.commandRemoveBuilder.bind(this)
    },
    {
      command: CommandKeys.GET_LIST_BUILDERS,
      description: 'Get list of all builders',
      handler: this.commandGetListBuilders.bind(this)
    },
    {
      command: CommandKeys.GET_CHAT_MEMBERS_COUNT,
      description: 'Get the number of members in a chat',
      handler: this.commandGetChatMembersCount.bind(this)
    },
    {
      command: CommandKeys.I_AM_BUILDER,
      description: 'Add yourself to list of builders',
      handler: this.commandIamBuilder.bind(this)
    },
    {
      command: CommandKeys.GET_LIST_BUILDERS_CSV,
      description: 'Get list of all builders in CSV format',
      handler: this.getListBuildersCsv.bind(this)
    },
  ]

  BOT_EVENTS = [
    {
      event: 'my_chat_member', // Bot status in a chat changes
      handler: this.myChatMember.bind(this)
    },
    {
      event: 'new_chat_members', // New members join the chat
      handler: this.newChatMembers.bind(this)
    },
    {
      event: 'left_chat_member', // A member leaves the chat
      handler: this.leftChatMember.bind(this)
    },
    {
      event: 'text', // User replies to the bot
      handler: this.processReply.bind(this)
    },
  ]

  constructor() {
    this.initTelegram()
  }

  async initTelegram() {
    this.bot = new Telegraf(TELEGRAM_BOT_TOKEN)
    this.bot.use(this.restrictToOwner.bind(this))
    this.bot.start(ctx => ctx.reply('Welcome'))
    this.bot.hears('hi', ctx => ctx.reply('Hey there'))

    // Add commands and set handlers
    this.bot.telegram.setMyCommands(this.COMMANDS)
    for (const command of this.COMMANDS) {
      this.bot.command(command.command, command.handler)
    }

    // Add bot events
    for (const event of this.BOT_EVENTS) {
      this.bot.on(event.event, event.handler)
    }

    this.bot.launch()
  }

  async commandGetListChannels(ctx) {
    try {
      const channels = await TelegramChatModel.find()
      const makeLine = (channel, index) => `${index + 1}/ ${channel.title}`
      await ctx.reply(`Channels:\n\n${channels.map(makeLine).join('\n')}
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
        channel.invite_link = await this.bot.telegram.exportChatInviteLink(channel.id)
        links.push({ name: channel.title, link: channel.invite_link })
      }

      const makeLine = (item, index) => ` ${index + 1}/ ${item.name}: ${item.link}`
      await ctx.reply(`Open the following links to join the channels:\n${links.map(makeLine).join('\n')}`)
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandGetListBuilders(ctx) {
    try {
      const builders = await TelegramUserModel.find({ is_bot: { $ne: true } })
      const makeLine = (builder, index) => `${index + 1}/ @${builder.username}: ${builder.first_name ?? ''} ${builder.last_name ?? ''} - ID: ${builder.id}`
      await ctx.reply(`
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
        await TelegramUserModel.create({
          id: ctx.from.id,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username,
        }).catch(() => {
          console.log('🔥 ~ TelegramService ~ commandAddMeToChannels ~ error adding user')
        })

        // Add user to chat id
        await TelegramUserJoinChatModel.create(
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
      console.log('~ TelegramService ~ myChatMember ~ status:', status, 'chat:', ctx.chat)
      switch (status) {
        case 'member':
          await TelegramChatModel.create({
            id: ctx.chat.id,
            title: ctx.chat.title,
            type: ctx.chat.type
          }).catch(() => {
            console.log('🔥 ~ TelegramService ~ myChatMember ~ error adding chat')
          })
          break
        case 'left':
          await TelegramChatModel.deleteOne({ id: ctx.chat.id })
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
        await TelegramUserModel.create({
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          username: member.username,
          is_bot: member.is_bot
        }).catch(() => {
          console.log('🔥 ~ TelegramService ~ newChatMembers ~ error adding user')
        })

        await TelegramUserJoinChatModel.create(
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
      await TelegramUserModel.deleteOne({ id: ctx.message.left_chat_member.id })
      await TelegramUserJoinChatModel.updateOne({ user_id: ctx.message.left_chat_member.id, chat_id: ctx.chat.id }, { status: 'removed' })
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
          await this.bot.telegram.banChatMember(chatId, builder.id).catch(() => {
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

  // Function to create a readable stream from a string
  createStreamFromString(content) {
    try {
      const readable = new Readable();
      readable._read = () => { }; // _read is required but you can noop it
      readable.push(content);
      readable.push(null); // Signal end of data
      return readable;
    } catch (error) {
      console.log('error', error)
    }
  }

  // Middleware to check if the user is the owner
  async restrictToOwner(ctx, next) {
    try {
      const adminIds = await this.botAdminIds()
      const fromId = ctx.message.from.id.toString()
      if (adminIds.includes(fromId)) {
        await next();
      } else {
        await ctx.reply('Sorry, only the bot owner can access this bot.');
      }
    } catch (error) {
      console.log('error', error)
    }
  };

  async botAdminIds() {
    try {
      const admins = await TelegramBotAdminModel.find()
      return [TELEGRAM_BOT_OWNER_ID, ...admins.map(admin => admin.user_id)]
    } catch (error) {
      console.log('error', error)
    }
  }

}

const main = async () => {
  await dbConnection()
  new TelegramService()
}

main()
