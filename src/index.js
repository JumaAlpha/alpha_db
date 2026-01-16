const Database = require('./Database.js');

// Demo function showing all features
function demo() {
  console.log('=== Alpha DB Demonstration ===\n');
  
  // Create database
  const db = new Database('demo');
  
  console.log('1. Creating tables...');
  
  // Create users table
  const userSchema = {
    id: { type: 'number', primaryKey: true, autoIncrement: true },
    username: { type: 'string', required: true, unique: true },
    email: { type: 'string', required: true },
    age: { type: 'number', defaultValue: 18 },
    active: { type: 'boolean', defaultValue: true },
    createdAt: { type: 'date', defaultValue: new Date() }
  };
  
  const users = db.createTable('users', userSchema);
  
  // Create products table
  const productSchema = {
    id: { type: 'string', primaryKey: true },
    name: { type: 'string', required: true },
    price: { type: 'number', required: true },
    category: { type: 'string', defaultValue: 'general' },
    inStock: { type: 'boolean', defaultValue: true }
  };
  
  const products = db.createTable('products', productSchema);
  
  console.log('2. Inserting data...');
  
  // Insert users
  users.insert({ username: 'alice', email: 'alice@example.com', age: 25 });
  users.insert({ username: 'bob', email: 'bob@example.com', age: 30 });
  users.insert({ username: 'charlie', email: 'charlie@example.com' }); // Uses default age
  
  // Insert products
  products.insert({ id: 'P001', name: 'Laptop', price: 999, category: 'electronics' });
  products.insert({ id: 'P002', name: 'Mouse', price: 25, category: 'electronics' });
  products.insert({ id: 'P003', name: 'Desk', price: 150, category: 'furniture' });
  
  console.log('3. Querying data...\n');
  
  // Find all users
  console.log('All users:');
  console.table(users.findAll());
  
  // Find with conditions
  console.log('\nUsers over age 21:');
  const olderUsers = users.find({ age: { '>': 21 } });
  console.table(olderUsers);
  
  // Find one
  console.log('\nFind user Alice:');
  const alice = users.findOne({ username: 'alice' });
  console.log(alice);
  
  console.log('\n4. Updating data...');
  
  // Update
  users.update({ username: 'alice' }, { age: 26 });
  console.log('Updated Alice\'s age to 26');
  
  // Create index and test performance
  console.log('\n5. Indexing demonstration...');
  
  users.createIndex('age');
  
  console.time('Indexed search');
  const age25 = users.find({ age: 25 });
  console.timeEnd('Indexed search');
  
  console.time('Non-indexed search');
  const inactiveUsers = users.find({ active: false });
  console.timeEnd('Non-indexed search');
  
  console.log('\n6. SQL-like queries...');
  
  // Using SQL parser
  const parser = new (require('./SQLParser.js'))();
  
  console.log('\nSQL: SELECT * FROM users WHERE age > 20');
  const result1 = parser.parseAndExecute('SELECT * FROM users WHERE age > 20', db);
  if (result1.success && result1.data) {
    console.table(result1.data);
  }
  
  console.log('\nSQL: UPDATE users SET active = false WHERE age < 18');
  const result2 = parser.parseAndExecute('UPDATE users SET active = false WHERE age < 18', db);
  console.log(result2.message);
  
  console.log('\n7. Table information...');
  console.log('Tables in database:', db.listTables());
  
  console.log('\n8. Testing constraints...');
  
  try {
    users.insert({ username: 'alice', email: 'another@example.com' });
    console.log('ERROR: Should have rejected duplicate username');
  } catch (error) {
    console.log('✓ Correctly rejected duplicate:', error.message);
  }
  
  try {
    users.insert({ username: 'david', email: 'not-an-email' });
    console.log('ERROR: Should have validated email format');
  } catch (error) {
    console.log('✓ Validation working');
  }
  
  console.log('\n=== Demo Complete ===');
  console.log('\nNext steps:');
  console.log('1. Run "npm run repl" for interactive SQL shell');
  console.log('2. Run "npm run web" for web interface');
  console.log('3. Check the data/ directory for persisted files');
}

// Run demo
demo();