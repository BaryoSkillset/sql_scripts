const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});

const dynamoDb = new AWS.DynamoDB.DocumentClient();
module.exports = (action, params) => {
  // Parameterize table names with stage name
  return dynamoDb[action]({
    ...params,
    TableName: params.TableName,
  }).promise();
}

