const User = require('./User');

const dbConnection = async () => {
    const users = await User.findAll();
    console.log(users)
}

dbConnection();