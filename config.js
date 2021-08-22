const { Pool } = require('pg');

const pool = new Pool({
  user: "postgres",
  host: "database-1.cewusmhjyipa.us-east-1.rds.amazonaws.com",
  database: "skillset_prod",
  password: "!Sk1lls#t2021$",
  port: 5432,
});

module.exports = pool;