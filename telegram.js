const dotenv = require('dotenv')
dotenv.config()
const { Telegraf } = require('telegraf')
const mongoose = require('mongoose')
const { Readable } = require('stream');

const { connect, Schema } = mongoose
let { MONGO_SRV_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_OWNER_ID } = process.env
console.log('TELEGRAM_BOT_OWNER_ID:', TELEGRAM_BOT_OWNER_ID)
console.log('MONGO_SRV_URL:', MONGO_SRV_URL)

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
    image: { type: String },
    role: { type: String },
    status: { type: String },
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
  'HELP': 'help',
  'I_AM_98_BUILDER': 'iam98builder',
  'GET_INVITE_LINKS': 'getinvitelinks',
  'GET_LIST_CHANNELS': 'getlistchannels',
  'GET_LIST_BUILDERS': 'getlistbuilders',
  'REMOVE_BUILDER': 'removebuilder',
  'GET_LIST_BUILDERS_CSV': 'getlistbuilderscsv',
  'ADD_BOT_ADMIN': 'addbotadmin',
  'GET_BOT_ADMINS': 'getbotadmins',
  'REMOVE_BOT_ADMIN': 'removebotadmin',
}

const ROLES = {
  builder: 'builder',
  hr: 'hr',
  admin: 'admin'
}

const USER_STATUS = {
  enabled: 'enabled',
  disabled: 'disabled'
}

class TelegramService {
  bot
  userStates = {} // In-memory state to track user conversations

  COMMANDS = [
    {
      command: CommandKeys.I_AM_98_BUILDER,
      description: 'Login to Ninety Eight',
      handler: this.commandIamBuilder.bind(this),
      roles: [ROLES.builder, ROLES.hr, ROLES.admin]
    },
    {
      command: CommandKeys.HELP,
      description: 'Get list of commands',
      handler: this.commandHelp.bind(this),
      roles: [ROLES.builder, ROLES.hr, ROLES.admin]
    },
    {
      command: CommandKeys.GET_INVITE_LINKS,
      description: 'Get invite links of all channels',
      handler: this.commandGetInviteLinks.bind(this),
      roles: [ROLES.admin]
    },
    {
      command: CommandKeys.GET_LIST_CHANNELS,
      description: 'Get list of all channels',
      handler: this.commandGetListChannels.bind(this),
      roles: [ROLES.admin]
    },
    {
      command: CommandKeys.GET_LIST_BUILDERS,
      description: 'Get list of all builders',
      handler: this.commandGetListBuilders.bind(this),
      roles: [ROLES.hr, ROLES.admin]
    },
    {
      command: CommandKeys.REMOVE_BUILDER,
      description: 'Remove builder from all channels and groups',
      handler: this.commandRemoveBuilder.bind(this),
      roles: [ROLES.hr, ROLES.admin]
    },
    {
      command: CommandKeys.GET_LIST_BUILDERS_CSV,
      description: 'Get list of all builders in CSV format',
      handler: this.getListBuildersCsv.bind(this),
      roles: [ROLES.hr, ROLES.admin]
    },
    {
      command: CommandKeys.ADD_BOT_ADMIN,
      description: 'Add a bot admin',
      handler: this.commandAddBotAdmin.bind(this),
      roles: [ROLES.admin]
    },
    {
      command: CommandKeys.GET_BOT_ADMINS,
      description: 'Get list of bot admins',
      handler: this.commandGetBotAdmins.bind(this),
      roles: [ROLES.admin]
    },
    {
      command: CommandKeys.REMOVE_BOT_ADMIN,
      description: 'Remove a bot admin',
      handler: this.commandRemoveBotAdmin.bind(this),
      roles: [ROLES.admin]
    }
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
    this.bot.use(this.setRoleAccess.bind(this))
    this.bot.start(ctx => ctx.reply('Welcome'))
    this.bot.hears('hi', ctx => ctx.reply('Hey there'))

    // Add commands and set handlers
    this.bot.telegram.setMyCommands([
      {
        command: CommandKeys.I_AM_98_BUILDER,
        description: 'Login to Ninety Eight',
        handler: this.commandIamBuilder.bind(this)
      }
    ])
    for (const command of this.COMMANDS) {
      this.bot.command(command.command, command.handler)
    }

    // Add bot events
    for (const event of this.BOT_EVENTS) {
      this.bot.on(event.event, event.handler)
    }

    this.bot.launch()
  }

  async commandHelp(ctx) {
    try {
      // Send the list of commands base on role
      const currentRole = ctx.from.role
      const commands = this.COMMANDS.filter(it => it.roles.includes(currentRole))
      const makeLine = (command, index) => `${index + 1}/ /${command.command} - ${command.description}`
      await ctx.reply(`Commands:\n\n${commands.map(makeLine).join('\n')}`)
    } catch (error) {
      console.log('error', error)
    }
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

  async commandAddBotAdmin(ctx) {
    try {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the `ID` and `role` (```hr```, ```admin```) of the user you want to add as bot admin\n\nExample: ```123456789 hr```')
      this.userStates[ctx.from.id] = { stage: CommandKeys.ADD_BOT_ADMIN }
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandGetBotAdmins(ctx) {
    try {
      const admins = await TelegramUserModel.find({role: { $in: ['hr', 'admin'] }})
      if (!admins.length) {
        await ctx.reply('There are no bot admins. Let\'s add some!')
        return
      }
      const makeLine = (admin, index) => `${index + 1}/ @${admin.username}: ${admin.first_name ?? ''} ${admin.last_name ?? ''} - ID: ${admin.id} - Role: ${admin.id === TELEGRAM_BOT_OWNER_ID ? 'OWNER' : admin.role.toUpperCase()}`
      await ctx.reply(`
      Bot Admins:\n\n${admins.map(makeLine).join('\n')}
    `)
    } catch (error) {
      console.log('error', error)
    }
  }

  async commandRemoveBotAdmin(ctx) {
    try {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the `ID` of the user you want to remove as bot admin')
      this.userStates[ctx.from.id] = { stage: CommandKeys.REMOVE_BOT_ADMIN }
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
          status: USER_STATUS.enabled
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
          case CommandKeys.ADD_BOT_ADMIN:
            await this.addBotAdmin(ctx)
            break
          case CommandKeys.REMOVE_BOT_ADMIN:
            await this.removeBotAdmin(ctx)
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
        await TelegramUserModel.updateOne({ id: builder.id }, { status: USER_STATUS.disabled, role: null })
        await this.bot.telegram.sendMessage(ctx.chat.id, `Builder \`@${builder.username}\` has been removed from all channels and groups`)
      }
    } catch (error) {
      console.log('error', error)
    }
  }

  async addBotAdmin(ctx) {
    try {
      // Get from telegram user
      const [userId, role] = ctx.message.text.split(' ')
      if (!userId || !role || !['hr', 'admin'].includes(role)) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'Invalid user ID or role')
        return
      }
      const user = await TelegramUserModel.findOne({ id: userId})
      if (!user) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'User not found')
        return
      } else {
        await TelegramUserModel.updateOne({ id: user.id }, { role: role }).catch(() => {
          console.log('🔥 ~ TelegramService ~ addBotAdmin ~ error adding user as bot admin')
        })
      }
      await this.bot.telegram.sendMessage(ctx.chat.id, `User \`@${user.username}\` has been added as ${role}`)
    } catch (error) {
      console.log('error', error)
    }
  }

  async removeBotAdmin(ctx) {
    try {
      if (!ctx.message.text) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'Invalid user ID')
        return
      }
      if (ctx.message.text === TELEGRAM_BOT_OWNER_ID) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'You cannot remove the bot owner')
        return
      }
      const adminId = ctx.message.text
      const user = await TelegramUserModel.findOne({ id: adminId, role: { $in: ['hr', 'admin'] } })
      console.log('TelegramService ~ removeBotAdmin ~ user:', user)
      if (!user) {
        await this.bot.telegram.sendMessage(ctx.chat.id, 'No bot admin found')
        return
      } else {
        await TelegramUserModel.updateOne({ id: user.id }, { role: null }).catch(() => {
          console.log('🔥 ~ TelegramService ~ removeBotAdmin ~ error removing user as bot admin')
        })
        await this.bot.telegram.sendMessage(ctx.chat.id, `User \`@${user.username}\` has been removed as bot admin`)
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
  async setRoleAccess(ctx, next) {
    try {

      // If message.text is not in command list, skip
      const isCommand = this.COMMANDS.some(it => {
        return `/${it.command}` == ctx.message.text
      })
      if (!isCommand) {
        await next();
        return
      }

      const currentRole = await this.getCtxCurrentRole(ctx)
      console.log('TelegramService ~ setRoleAccess ~ currentRole:', currentRole)

      if (!currentRole || !ctx.message?.text) {
        await next();
        return
      }

      ctx.from.role = currentRole

      for (const role of Object.values(ROLES)) {
        if (role != currentRole) {
          continue
        }
        const validCmd = this.COMMANDS.filter(it => it.roles.includes(role)).some(it => {
          return `/${it.command}` == ctx.message.text
        })
        console.log('TelegramService ~ setRoleAccess ~ validCmd:', validCmd)
        if (validCmd) {
          await next();
          return
        } else {
          await ctx.reply('Sorry, you do not have permission to access this command.');
          return
        }
      }
      await next();
    } catch (error) {
      console.log('error', error)
      try {
        await ctx.reply('Sorry, an error occurred. Please try again later.')
      } catch (error) {}
    }
  };

  async getCtxCurrentRole(ctx) {
    try {
      const admins = await TelegramUserModel.find({role: { $in: ['hr', 'admin'] }})
      const fromId = `${ctx.message?.from?.id}`
      if (!fromId) {
        return
      }
      if (fromId === TELEGRAM_BOT_OWNER_ID) {
        return ROLES.admin
      } else {
        const admin = admins.find(admin => admin.id === fromId)
        if (admin) {
          return admin.role
        } else {
          return ROLES.builder
        }
      }
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
