const readline = require('readline');
const Database = require('./Database.js');

class REPL {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'alpha-db> '
    });
    
    this.currentDB = null;
    this.setupEvents();
  }

  setupEvents() {
    console.log('Alpha DB - Simple RDBMS');
    console.log('Type "help" for commands, "exit" to quit\n');
    
    this.rl.prompt();
    
    this.rl.on('line', (line) => {
      const input = line.trim();
      
      if (input.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        this.rl.close();
        return;
      }
      
      if (input.toLowerCase() === 'help') {
        this.showHelp();
        this.rl.prompt();
        return;
      }
      
      if (input.toLowerCase().startsWith('use ')) {
        const dbName = input.substring(4).trim();
        this.currentDB = new Database(dbName);
        console.log(`Using database '${dbName}'`);
        this.rl.prompt();
        return;
      }
      
      if (!this.currentDB) {
        console.log('No database selected. Use "USE <dbname>" first.');
        this.rl.prompt();
        return;
      }
      
      try {
        const result = this.currentDB.query(input);
        if (result.success) {
          console.log(result.message);
          if (result.data) {
            if (Array.isArray(result.data)) {
              if (result.data.length === 0) {
                console.log('No results');
              } else {
                console.table(result.data);
              }
            } else {
              console.log(result.data);
            }
          }
        } else {
          console.log('Error:', result.error);
        }
      } catch (error) {
        console.log('Error:', error.message);
      }
      
      this.rl.prompt();
    });
    
    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  showHelp() {
    console.log(`
Available Commands:
  USE <database>           - Select/create database
  CREATE TABLE <name> (...) - Create table with schema
  INSERT INTO <table> (...) VALUES (...) - Insert record
  SELECT * FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT ...] - Query data
  UPDATE <table> SET ... WHERE ... - Update records
  DELETE FROM <table> [WHERE ...] - Delete records
  DROP TABLE <table>      - Delete table
  help                    - Show this help
  exit                    - Exit the REPL

Examples:
  USE mydb
  CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR NOT NULL, age INT)
  INSERT INTO users (name, age) VALUES ('Alice', 25)
  SELECT * FROM users WHERE age > 20 ORDER BY name LIMIT 10
  UPDATE users SET age = 26 WHERE name = 'Alice'
  DELETE FROM users WHERE age < 18
    `);
  }
}

// Start REPL if run directly
if (require.main === module) {
  new REPL();
} else {
  module.exports = REPL;
}