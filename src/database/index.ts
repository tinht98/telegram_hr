import { MONGO_SRV_URL } from '@config'
import mongoose, { ConnectOptions, connect } from 'mongoose'

export const dbConnection = async () => {
  try {
    const dbConfig = {
      url: MONGO_SRV_URL
    }

    // if (NODE_ENV !== 'production') {
    //   set('debug', true)
    // }

    const options = {
      connectTimeoutMS: 30000,
      readPreference: 'primaryPreferred', // primary also will make mongoose auto create indexes in collections
      useUnifiedTopology: true,
      useNewUrlParser: true
    } as ConnectOptions

    await connect(dbConfig.url, options)

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
