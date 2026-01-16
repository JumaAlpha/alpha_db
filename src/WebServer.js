const express = require('express');
const Database = require('./Database.js');
const path = require('path');
const fs = require('fs');

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.databases = {};
    
    // Load all existing databases on startup
    this.loadExistingDatabases();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  // New method: Load existing databases
  loadExistingDatabases() {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory');
        return;
      }
      
      const dbDirs = fs.readdirSync(dataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      console.log(`📂 Found ${dbDirs.length} existing database(s):`);
      
      dbDirs.forEach(dbName => {
        try {
          this.databases[dbName] = new Database(dbName);
          const tableCount = this.databases[dbName].listTables().length;
          console.log(`   • ${dbName} (${tableCount} tables)`);
        } catch (error) {
          console.error(`   ✗ Failed to load database ${dbName}:`, error.message);
        }
      });
      
      if (dbDirs.length === 0) {
        console.log('   No databases found');
      }
    } catch (error) {
      console.error('Error loading existing databases:', error.message);
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Serve index.html
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'index.html'));
    });

    // API endpoint for SQL queries
    this.app.post('/api/query', (req, res) => {
      const { database, sql } = req.body;
      
      if (!database || !sql) {
        return res.json({ success: false, error: 'Database and SQL query required' });
      }
      
      try {
        // Get or create database
        if (!this.databases[database]) {
          this.databases[database] = new Database(database);
          console.log(`📝 Created new database in memory: ${database}`);
        }
        
        const db = this.databases[database];
        const result = db.query(sql);
        
        res.json(result);
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // API endpoint to create database
    this.app.post('/api/database/create', (req, res) => {
      const { name } = req.body;
      
      if (!name) {
        return res.json({ success: false, error: 'Database name required' });
      }
      
      try {
        // Check if database already exists
        const dataDir = path.join(process.cwd(), 'data', name);
        if (fs.existsSync(dataDir)) {
          console.log(`⚠️  Database already exists on disk: ${name}`);
        }
        
        this.databases[name] = new Database(name);
        console.log(`✅ Created database: ${name}`);
        
        res.json({ 
          success: true, 
          message: `Database '${name}' created successfully` 
        });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // API endpoint to list databases
    this.app.get('/api/databases', (req, res) => {
      const dbs = Object.keys(this.databases);
      
      // Also check for databases that might exist on disk but aren't loaded
      const dataDir = path.join(process.cwd(), 'data');
      let allDbs = [...dbs];
      
      if (fs.existsSync(dataDir)) {
        const diskDbs = fs.readdirSync(dataDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        // Merge and deduplicate
        allDbs = [...new Set([...allDbs, ...diskDbs])];
      }
      
      res.json({ success: true, data: allDbs.sort() });
    });

    // API endpoint to list tables
    this.app.get('/api/:database/tables', (req, res) => {
      const dbName = req.params.database;
      
      if (!this.databases[dbName]) {
        // Database doesn't exist in memory, try to load from disk
        const dataDir = path.join(process.cwd(), 'data', dbName);
        if (!fs.existsSync(dataDir)) {
          return res.json({ 
            success: false, 
            error: `Database '${dbName}' does not exist` 
          });
        }
        
        try {
          this.databases[dbName] = new Database(dbName);
          console.log(`📥 Loaded database from disk: ${dbName}`);
        } catch (error) {
          return res.json({ 
            success: false, 
            error: `Failed to load database '${dbName}': ${error.message}` 
          });
        }
      }
      
      const tables = this.databases[dbName].listTables();
      res.json({ success: true, data: tables });
    });

    // API endpoint to get table data
    this.app.get('/api/:database/tables/:table', (req, res) => {
      const { database, table } = req.params;
      
      if (!this.databases[database]) {
        // Try to load from disk
        const dataDir = path.join(process.cwd(), 'data', database);
        if (!fs.existsSync(dataDir)) {
          return res.json({ 
            success: false, 
            error: `Database '${database}' does not exist` 
          });
        }
        
        try {
          this.databases[database] = new Database(database);
          console.log(`📥 Loaded database from disk: ${database}`);
        } catch (error) {
          return res.json({ 
            success: false, 
            error: `Failed to load database '${database}': ${error.message}` 
          });
        }
      }
      
      try {
        const db = this.databases[database];
        const tableData = db.getTable(table).findAll();
        res.json({ success: true, data: tableData });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // API endpoint to drop table
    this.app.delete('/api/:database/tables/:table', (req, res) => {
      const { database, table } = req.params;
      
      if (!this.databases[database]) {
        return res.json({ success: false, error: 'Database not found' });
      }
      
      try {
        const db = this.databases[database];
        db.dropTable(table);
        console.log(`🗑️  Dropped table: ${database}.${table}`);
        res.json({ success: true, message: `Table '${table}' dropped` });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        success: true, 
        status: 'running', 
        loadedDatabases: Object.keys(this.databases).length 
      });
    });

    // Reload all databases from disk
    this.app.post('/api/reload-databases', (req, res) => {
      this.loadExistingDatabases();
      res.json({ 
        success: true, 
        message: 'Databases reloaded',
        count: Object.keys(this.databases).length 
      });
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`\n🚀 Alpha DB Web Interface running on http://localhost:${this.port}`);
      console.log(`📊 Loaded ${Object.keys(this.databases).length} database(s)`);
      console.log(`\n💡 Open http://localhost:${this.port} in your browser to start!`);
      console.log(`\n📝 Available API endpoints:`);
      console.log(`   • POST /api/query - Execute SQL query`);
      console.log(`   • POST /api/database/create - Create new database`);
      console.log(`   • GET /api/databases - List all databases`);
      console.log(`   • GET /api/:database/tables - List tables in database`);
      console.log(`   • GET /api/health - Health check`);
    });
  }
}

// Starting the server
if (require.main === module) {
  const server = new WebServer();
  server.start();
} else {
  module.exports = WebServer;
}