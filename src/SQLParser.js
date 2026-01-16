class SQLParser {
  parseAndExecute(sql, database) {
    const tokens = this.tokenize(sql);
    const command = tokens[0]?.toUpperCase();
    
    try {
      switch(command) {
        case 'CREATE':
          return this.parseCreate(tokens, database);
        case 'INSERT':
          return this.parseInsert(tokens, database);
        case 'SELECT':
          return this.parseSelect(tokens, database);
        case 'UPDATE':
          return this.parseUpdate(tokens, database);
        case 'DELETE':
          return this.parseDelete(tokens, database);
        case 'DROP':
          return this.parseDrop(tokens, database);
        case 'USE':
          return { success: true, message: `Using database ${tokens[1]}` };
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  tokenize(sql) {
    return sql
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .replace(/,/g, ' , ')
      .replace(/;/g, '')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  parseCreate(tokens, database) {
    if (tokens[1]?.toUpperCase() !== 'TABLE') {
      throw new Error('Expected TABLE after CREATE');
    }
    
    const tableName = tokens[2];
    const schema = {};
    
    let i = 4; // Skip CREATE TABLE name (
    while (i < tokens.length && tokens[i] !== ')') {
      const columnName = tokens[i++];
      const dataType = tokens[i++];
      
      const columnDef = { type: dataType.toLowerCase() };
      
      // Parse constraints
      while (i < tokens.length && tokens[i] !== ',' && tokens[i] !== ')') {
        const constraint = tokens[i++].toUpperCase();
        switch(constraint) {
          case 'PRIMARY':
            if (tokens[i] === 'KEY') i++;
            columnDef.primaryKey = true;
            break;
          case 'UNIQUE':
            columnDef.unique = true;
            break;
          case 'AUTO_INCREMENT':
            columnDef.autoIncrement = true;
            break;
          case 'NOT':
            if (tokens[i] === 'NULL') i++;
            columnDef.required = true;
            break;
          case 'DEFAULT':
            columnDef.defaultValue = tokens[i++];
            break;
        }
      }
      
      schema[columnName] = columnDef;
      if (tokens[i] === ',') i++;
    }
    
    database.createTable(tableName, schema);
    return { success: true, message: `Table ${tableName} created` };
  }

  parseInsert(tokens, database) {
    if (tokens[1]?.toUpperCase() !== 'INTO') {
      throw new Error('Expected INTO after INSERT');
    }
    
    const tableName = tokens[2];
    const table = database.getTable(tableName);
    
    let i = 3;
    let columns = [];
    
    if (tokens[i] === '(') {
      i++;
      while (tokens[i] !== ')') {
        columns.push(tokens[i++]);
        if (tokens[i] === ',') i++;
      }
      i++; // Skip ')'
    }
    
    if (tokens[i]?.toUpperCase() !== 'VALUES') {
      throw new Error('Expected VALUES');
    }
    i++;
    
    if (tokens[i] !== '(') throw new Error('Expected ( after VALUES');
    i++;
    
    const values = [];
    while (tokens[i] !== ')') {
      let value = tokens[i++];
      
      // Handle strings
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      } else if (!isNaN(value)) {
        value = Number(value);
      } else if (value === 'TRUE' || value === 'true') {
        value = true;
      } else if (value === 'FALSE' || value === 'false') {
        value = false;
      } else if (value === 'NULL') {
        value = null;
      }
      
      values.push(value);
      if (tokens[i] === ',') i++;
    }
    
    const record = {};
    for (let j = 0; j < columns.length; j++) {
      record[columns[j]] = values[j];
    }
    
    const result = table.insert(record);
    return { 
      success: true, 
      message: `Record inserted with ID: ${result.id || result[table.primaryKey]}`,
      data: result 
    };
  }

  parseSelect(tokens, database) {
    let i = 1;
    const columns = [];
    
    // Parse columns
    while (i < tokens.length && tokens[i]?.toUpperCase() !== 'FROM') {
      if (tokens[i] !== ',') {
        columns.push(tokens[i]);
      }
      i++;
    }
    
    if (tokens[i]?.toUpperCase() !== 'FROM') {
      throw new Error('Expected FROM in SELECT');
    }
    i++;
    
    const tableName = tokens[i++];
    const table = database.getTable(tableName);
    
    // Parse WHERE clause
    let conditions = {};
    if (i < tokens.length && tokens[i]?.toUpperCase() === 'WHERE') {
      i++;
      conditions = this.parseCondition(tokens, i);
      i += 3; // Skip condition tokens
    }
    
    // Parse ORDER BY
    let orderBy = null;
    let orderDir = 'ASC';
    if (i < tokens.length && tokens[i]?.toUpperCase() === 'ORDER' && tokens[i+1]?.toUpperCase() === 'BY') {
      i += 2;
      orderBy = tokens[i++];
      if (i < tokens.length && (tokens[i]?.toUpperCase() === 'ASC' || tokens[i]?.toUpperCase() === 'DESC')) {
        orderDir = tokens[i++].toUpperCase();
      }
    }
    
    // Parse LIMIT
    let limit = null;
    if (i < tokens.length && tokens[i]?.toUpperCase() === 'LIMIT') {
      i++;
      limit = parseInt(tokens[i++]);
    }
    
    let results = table.find(conditions);
    
    // Apply column selection
    if (!columns.includes('*') && columns.length > 0) {
      results = results.map(row => {
        const selected = {};
        columns.forEach(col => {
          if (col in row) selected[col] = row[col];
        });
        return selected;
      });
    }
    
    // Apply ordering
    if (orderBy) {
      results.sort((a, b) => {
        const aVal = a[orderBy];
        const bVal = b[orderBy];
        if (orderDir === 'ASC') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }
    
    // Apply limit
    if (limit) {
      results = results.slice(0, limit);
    }
    
    return {
      success: true,
      message: `Found ${results.length} record(s)`,
      data: results
    };
  }

  parseCondition(tokens, start) {
    const column = tokens[start];
    const operator = tokens[start + 1];
    const value = tokens[start + 2];
    
    let parsedValue = value;
    if (value.startsWith("'") && value.endsWith("'")) {
      parsedValue = value.slice(1, -1);
    } else if (!isNaN(value)) {
      parsedValue = Number(value);
    } else if (value === 'TRUE' || value === 'true') {
      parsedValue = true;
    } else if (value === 'FALSE' || value === 'false') {
      parsedValue = false;
    } else if (value === 'NULL') {
      parsedValue = null;
    }
    
    return { [column]: { [operator]: parsedValue } };
  }

  parseUpdate(tokens, database) {
    const tableName = tokens[1];
    const table = database.getTable(tableName);
    
    if (tokens[2]?.toUpperCase() !== 'SET') {
      throw new Error('Expected SET after table name');
    }
    
    let i = 3;
    const updates = {};
    
    // Parse SET clause
    while (i < tokens.length && tokens[i]?.toUpperCase() !== 'WHERE') {
      const column = tokens[i++];
      if (tokens[i] !== '=') throw new Error('Expected = after column name');
      i++;
      
      let value = tokens[i++];
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      } else if (!isNaN(value)) {
        value = Number(value);
      } else if (value === 'TRUE' || value === 'true') {
        value = true;
      } else if (value === 'FALSE' || value === 'false') {
        value = false;
      } else if (value === 'NULL') {
        value = null;
      }
      
      updates[column] = value;
      if (tokens[i] === ',') i++;
    }
    
    // Parse WHERE clause
    let conditions = {};
    if (i < tokens.length && tokens[i]?.toUpperCase() === 'WHERE') {
      i++;
      conditions = this.parseCondition(tokens, i);
    }
    
    const affected = table.update(conditions, updates);
    return {
      success: true,
      message: `Updated ${affected} record(s)`
    };
  }

  parseDelete(tokens, database) {
    if (tokens[1]?.toUpperCase() !== 'FROM') {
      throw new Error('Expected FROM after DELETE');
    }
    
    const tableName = tokens[2];
    const table = database.getTable(tableName);
    
    let conditions = {};
    if (tokens.length > 3 && tokens[3]?.toUpperCase() === 'WHERE') {
      conditions = this.parseCondition(tokens, 4);
    }
    
    const affected = table.delete(conditions);
    return {
      success: true,
      message: `Deleted ${affected} record(s)`
    };
  }

  parseDrop(tokens, database) {
    if (tokens[1]?.toUpperCase() !== 'TABLE') {
      throw new Error('Expected TABLE after DROP');
    }
    
    const tableName = tokens[2];
    database.dropTable(tableName);
    return {
      success: true,
      message: `Table ${tableName} dropped`
    };
  }
}

module.exports = SQLParser;