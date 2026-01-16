const fs = require('fs');
const path = require('path');
const Table = require('./Table.js');

class Database {
  constructor(name) {
    this.name = name;
    this.tables = {};
    this.dataDir = path.join(process.cwd(), 'data', name);
    
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load existing tables
    this.loadTables();
  }

  loadTables() {
    try {
      const files = fs.readdirSync(this.dataDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const tableName = file.replace('.json', '');
          const schemaPath = path.join(this.dataDir, `${tableName}_schema.json`);
          
          if (fs.existsSync(schemaPath)) {
            const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
            this.tables[tableName] = new Table(tableName, schema, this.dataDir);
          }
        }
      });
    } catch (error) {
      // Directory might not exist yet
    }
  }

  createTable(tableName, schema) {
    if (this.tables[tableName]) {
      throw new Error(`Table '${tableName}' already exists`);
    }
    
    // Save schema
    const schemaPath = path.join(this.dataDir, `${tableName}_schema.json`);
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    
    this.tables[tableName] = new Table(tableName, schema, this.dataDir);
    return this.tables[tableName];
  }

  getTable(tableName) {
    const table = this.tables[tableName];
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist`);
    }
    return table;
  }

  dropTable(tableName) {
    if (!this.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }
    
    this.tables[tableName].drop();
    delete this.tables[tableName];
    
    // Remove schema file
    const schemaPath = path.join(this.dataDir, `${tableName}_schema.json`);
    if (fs.existsSync(schemaPath)) {
      fs.unlinkSync(schemaPath);
    }
    
    return true;
  }

  listTables() {
    return Object.keys(this.tables);
  }

  query(sql) {
    const parser = new (require('./SQLParser.js'))();
    return parser.parseAndExecute(sql, this);
  }
}

module.exports = Database;