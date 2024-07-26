export enum USER_ROLE {
  admin = 'admin',
  member = 'member'
}

export enum ERROR_MESSAGE {
  invalidToken = 'invalidToken',
  tokenNotFound = 'tokenNotFound',
  invalidRole = 'invalidRole',
  urlNotFound = 'urlNotFound',
  sourceNotFound = 'sourceNotFound',
  resourceNotFound = 'resourceNotFound',

  unknownError = 'unknownError',
  internalServerError = 'internalServerError'
}
