const express = require('express');
const Database = require('./Database.js');

class WebServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.databases = {};
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Home page
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Alpha DB Web Interface</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .row { display: flex; gap: 20px; }
            .col { flex: 1; }
            textarea, input, button { width: 100%; margin: 5px 0; padding: 10px; }
            textarea { height: 200px; font-family: monospace; }
            button { background: #007bff; color: white; border: none; cursor: pointer; }
            button:hover { background: #0056b3; }
            .result { background: #f5f5f5; padding: 10px; margin: 10px 0; }
            .error { color: red; }
            .success { color: green; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Alpha DB Web Interface</h1>
            <div class="row">
              <div class="col">
                <h3>SQL Query</h3>
                <form id="queryForm">
                  <select id="database">
                    <option value="testdb">testdb</option>
                    <option value="mydb">mydb</option>
                  </select>
                  <textarea id="sql" placeholder="Enter SQL query..."></textarea>
                  <button type="submit">Execute</button>
                </form>
                <div id="result"></div>
              </div>
              <div class="col">
                <h3>Quick Examples</h3>
                <button onclick="runExample('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR NOT NULL, age INT)')">
                  Create Users Table
                </button>
                <button onclick="runExample('INSERT INTO users (name, age) VALUES (\\'Alice\\', 25)')">
                  Insert Sample Data
                </button>
                <button onclick="runExample('SELECT * FROM users')">
                  Select All Users
                </button>
                <button onclick="runExample('UPDATE users SET age = 26 WHERE name = \\'Alice\\'')">
                  Update Record
                </button>
                <button onclick="runExample('DELETE FROM users WHERE name = \\'Alice\\'')">
                  Delete Record
                </button>
                <h3>Database Status</h3>
                <div id="status">Ready</div>
              </div>
            </div>
          </div>
          <script>
            document.getElementById('queryForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const db = document.getElementById('database').value;
              const sql = document.getElementById('sql').value;
              
              const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database: db, sql: sql })
              });
              
              const result = await response.json();
              const resultDiv = document.getElementById('result');
              
              if (result.success) {
                resultDiv.innerHTML = \`
                  <div class="success"><strong>Success:</strong> \${result.message}</div>
                  \${result.data ? '<pre>' + JSON.stringify(result.data, null, 2) + '</pre>' : ''}
                \`;
              } else {
                resultDiv.innerHTML = \`<div class="error"><strong>Error:</strong> \${result.error}</div>\`;
              }
            });
            
            function runExample(sql) {
              document.getElementById('sql').value = sql;
              document.getElementById('queryForm').dispatchEvent(new Event('submit'));
            }
          </script>
        </body>
        </html>
      `);
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
        }
        
        const db = this.databases[database];
        const result = db.query(sql);
        
        res.json(result);
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // API endpoint to list tables
    this.app.get('/api/:database/tables', (req, res) => {
      const dbName = req.params.database;
      
      if (!this.databases[dbName]) {
        this.databases[dbName] = new Database(dbName);
      }
      
      const tables = this.databases[dbName].listTables();
      res.json({ success: true, data: tables });
    });

    // API endpoint to get table data
    this.app.get('/api/:database/tables/:table', (req, res) => {
      const { database, table } = req.params;
      
      if (!this.databases[database]) {
        return res.json({ success: false, error: 'Database not found' });
      }
      
      try {
        const db = this.databases[database];
        const tableData = db.getTable(table).findAll();
        res.json({ success: true, data: tableData });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`Alpha DB Web Server running on http://localhost:${this.port}`);
      console.log(`REPL available via: npm run repl`);
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new WebServer();
  server.start();
} else {
  module.exports = WebServer;
}