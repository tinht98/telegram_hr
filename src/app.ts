import { Routes } from '@/interfaces'
import { ErrorMiddleware, ResponseMiddleware } from '@/middlewares'
import { CREDENTIALS, LOG_FORMAT, NODE_ENV, PORT } from '@config'
import { dbConnection } from '@database'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import 'express-async-errors'
import helmet from 'helmet'
import hpp from 'hpp'
import mongoose from 'mongoose'
import morgan from 'morgan'
import 'reflect-metadata'
import swaggerJSDoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

export default class App {
  public app: express.Application
  public env: string
  public port: string | number

  constructor(routes: Routes[]) {
    this.app = express()
    this.env = NODE_ENV || 'development'
    this.port = PORT || 3000

    this.connectToDatabase()
    this.initializeMiddlewares()
    this.initializeRoutes(routes)
    this.initializeSwagger()
    this.initializeErrorHandling()
    this.initializeHealthCheck()
  }

  public listen() {
    this.app.listen(this.port, () => {
      console.info(`=================================`)
      console.info(`🚀 Server listening on the port ${this.port}`)
      console.info(`=================================`)
    })
  }

  public getServer() {
    return this.app
  }

  private async connectToDatabase() {
    mongoose.set('debug', true)
    await dbConnection()
  }

  private initializeMiddlewares() {
    this.app.use(morgan(LOG_FORMAT))
    this.app.use(cors({ credentials: CREDENTIALS }))
    this.app.use(hpp())
    this.app.use(ResponseMiddleware)
    this.app.use(helmet())
    this.app.use(compression())
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
  }

  private initializeRoutes(routes: Routes[]) {
    routes.forEach(route => {
      this.app.use(`${route.path}`, route.router)
    })
  }

  private initializeHealthCheck() {
    this.app.get('/health', (req, res) => res.json(true))
  }

  private initializeSwagger() {
    const options = {
      swaggerDefinition: {
        info: {
          title: 'REST API',
          version: '1.0.0',
          description: 'Example docs'
        }
      },
      apis: ['swagger.yaml']
    }

    const specs = swaggerJSDoc(options)
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs))
  }

  private initializeErrorHandling() {
    this.app.use(ErrorMiddleware)
  }
}
