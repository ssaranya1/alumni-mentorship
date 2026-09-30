const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'mentorship';

let client;
let database;

async function connectDB() {
  if (database) return database;

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  database = client.db(DB_NAME);

  console.log(`MongoDB Connected: ${DB_NAME}`);
  return database;
}

function getDB() {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
}

async function nextId(sequenceName) {
  const result = await getDB().collection('_counters').findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.value.value;
}

module.exports = { connectDB, getDB, nextId, MONGODB_URI, DB_NAME };
