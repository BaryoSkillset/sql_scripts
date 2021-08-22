const { Model, DataTypes, Sequelize } = require('sequelize');

var sequelize = new Sequelize('postgres', 'postgres', '!Sk1lls#t2021$', {
    host: 'database-1.cewusmhjyipa.us-east-1.rds.amazonaws.com',
    dialect: 'postgres',
    port: 5432,
  
    pool: {
      max: 5,
      min: 0,
      idle: 10000
    }
  });

class User extends Model {}

User.init(
  {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
    },
    user_uuid: {
        type: DataTypes.UUID
    },
    email: {
        type:  DataTypes.STRING,
        allowNull: false
    },
  },
  {
    sequelize,
    modelName: "users",
    createdAt: false,
    updatedAt: false,
  }
);

module.exports = User;