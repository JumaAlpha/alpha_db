const fs = require('fs');
const path = require('path');

class Table {
  constructor(name, schema, dataDir) {
    this.name = name;
    this.schema = this.normalizeSchema(schema);
    this.filePath = path.join(dataDir, `${name}.json`);
    this.indexPath = path.join(dataDir, `${name}_index.json`);
    this.data = [];
    this.indexes = {};
    this.primaryKey = this.findPrimaryKey();
    
    this.load();
    this.loadIndexes();
    
    if (this.primaryKey && !this.indexes[this.primaryKey]) {
      this.createIndex(this.primaryKey);
    }
  }

  normalizeSchema(schema) {
    const normalized = {};
    for (const column in schema) {
      normalized[column] = {
        type: schema[column].type || 'string',
        required: schema[column].required || false,
        primaryKey: schema[column].primaryKey || false,
        unique: schema[column].unique || false,
        autoIncrement: schema[column].autoIncrement || false,
        defaultValue: schema[column].defaultValue,
        foreignKey: schema[column].foreignKey || null
      };
      
      if (normalized[column].primaryKey) {
        normalized[column].required = true;
        normalized[column].unique = true;
      }
    }
    return normalized;
  }

  findPrimaryKey() {
    for (const column in this.schema) {
      if (this.schema[column].primaryKey) return column;
    }
    return null;
  }

  validateType(value, type) {
    if (value === null || value === undefined) return true;
    
    switch(type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && !isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'date': return !isNaN(Date.parse(value));
      case 'object': return typeof value === 'object' && !Array.isArray(value);
      case 'array': return Array.isArray(value);
      default: return true;
    }
  }

  coerceValue(value, type) {
    if (value === null || value === undefined) return value;
    
    switch(type) {
      case 'string': return String(value);
      case 'number': 
        const num = Number(value);
        return isNaN(num) ? null : num;
      case 'boolean': return Boolean(value);
      case 'date': return new Date(value);
      default: return value;
    }
  }

  validateRecord(record) {
    const errors = [];
    const result = {};
    
    for (const column in this.schema) {
      const def = this.schema[column];
      const value = record[column];
      const hasValue = column in record;
      
      // Auto-increment handled separately
      if (def.autoIncrement && !hasValue) continue;
      
      // Required check
      if (def.required && !hasValue && def.defaultValue === undefined) {
        errors.push(`Required column '${column}' is missing`);
        continue;
      }
      
      // Apply default
      if (!hasValue && def.defaultValue !== undefined) {
        result[column] = this.coerceValue(def.defaultValue, def.type);
        continue;
      }
      
      // Skip if no value and not required
      if (!hasValue) continue;
      
      // Type validation
      if (!this.validateType(value, def.type)) {
        errors.push(`Invalid type for '${column}': expected ${def.type}`);
        continue;
      }
      
      // Coerce value
      result[column] = this.coerceValue(value, def.type);
      
      // Unique check
      if (def.unique && this.indexes[column]) {
        const existing = this.findOne({ [column]: result[column] });
        if (existing && existing[this.primaryKey] !== record[this.primaryKey]) {
          errors.push(`Duplicate value for unique column '${column}'`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }
    
    return result;
  }

  insert(record) {
    const validated = this.validateRecord(record);
    
    // Handle auto-increment
    for (const column in this.schema) {
      if (this.schema[column].autoIncrement && !(column in validated)) {
        const max = this.data.reduce((max, row) => 
          Math.max(max, row[column] || 0), 0);
        validated[column] = max + 1;
      }
    }
    
    this.data.push(validated);
    const index = this.data.length - 1;
    
    // Update indexes
    for (const col in this.indexes) {
      const value = validated[col];
      if (value !== undefined) {
        if (!this.indexes[col][value]) this.indexes[col][value] = [];
        this.indexes[col][value].push(index);
      }
    }
    
    this.save();
    this.saveIndexes();
    return { ...validated };
  }

  find(conditions = {}) {
    if (Object.keys(conditions).length === 0) {
      return this.data.map(r => ({ ...r }));
    }
    
    // Try indexed search
    const keys = Object.keys(conditions);
    if (keys.length === 1 && this.indexes[keys[0]]) {
      const col = keys[0];
      const value = conditions[col];
      const indices = this.indexes[col][value];
      if (indices) {
        return indices.map(i => ({ ...this.data[i] }));
      }
      return [];
    }
    
    // Full scan with operator support
    return this.data.filter(record => {
      for (const key in conditions) {
        const condition = conditions[key];
        
        if (typeof condition === 'object') {
          // Handle operators
          for (const op in condition) {
            const val = condition[op];
            if (!this.compare(record[key], op, val)) return false;
          }
        } else {
          // Simple equality
          if (record[key] !== condition) return false;
        }
      }
      return true;
    }).map(r => ({ ...r }));
  }

  compare(value, operator, compareTo) {
    switch(operator) {
      case '=': return value == compareTo;
      case '!=': return value != compareTo;
      case '>': return value > compareTo;
      case '<': return value < compareTo;
      case '>=': return value >= compareTo;
      case '<=': return value <= compareTo;
      case 'LIKE': 
        const pattern = compareTo.replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`).test(String(value));
      default: return false;
    }
  }

  findOne(conditions) {
    const results = this.find(conditions);
    return results.length > 0 ? results[0] : null;
  }

  findAll() {
    return this.data.map(r => ({ ...r }));
  }

  update(conditions, updates) {
    const toUpdate = this.find(conditions);
    const indices = [];
    
    // Find indices
    for (const record of toUpdate) {
      const idx = this.data.findIndex(r => {
        if (this.primaryKey) return r[this.primaryKey] === record[this.primaryKey];
        return r === record;
      });
      if (idx !== -1) indices.push(idx);
    }
    
    // Remove old index entries
    for (const col in this.indexes) {
      for (const idx of indices) {
        const oldValue = this.data[idx][col];
        if (oldValue !== undefined && this.indexes[col][oldValue]) {
          this.indexes[col][oldValue] = this.indexes[col][oldValue].filter(i => i !== idx);
        }
      }
    }
    
    // Update records
    let updated = 0;
    for (const idx of indices) {
      const newRecord = { ...this.data[idx], ...updates };
      const validated = this.validateRecord(newRecord);
      
      // Check primary key uniqueness
      if (this.primaryKey && this.primaryKey in updates) {
        const existing = this.findOne({ [this.primaryKey]: validated[this.primaryKey] });
        if (existing && existing !== this.data[idx]) {
          throw new Error(`Duplicate primary key value`);
        }
      }
      
      this.data[idx] = validated;
      updated++;
    }
    
    // Add new index entries
    for (const col in this.indexes) {
      for (const idx of indices) {
        const newValue = this.data[idx][col];
        if (newValue !== undefined) {
          if (!this.indexes[col][newValue]) this.indexes[col][newValue] = [];
          this.indexes[col][newValue].push(idx);
        }
      }
    }
    
    if (updated > 0) {
      this.save();
      this.saveIndexes();
    }
    
    return updated;
  }

  delete(conditions) {
    const toDelete = this.find(conditions);
    const indices = [];
    
    for (const record of toDelete) {
      const idx = this.data.findIndex(r => {
        if (this.primaryKey) return r[this.primaryKey] === record[this.primaryKey];
        return r === record;
      });
      if (idx !== -1) indices.push(idx);
    }
    
    indices.sort((a, b) => b - a);
    
    // Remove from indexes
    for (const col in this.indexes) {
      for (const idx of indices) {
        const value = this.data[idx][col];
        if (value !== undefined && this.indexes[col][value]) {
          this.indexes[col][value] = this.indexes[col][value].filter(i => i !== idx);
        }
      }
      
      // Rebuild index to fix indices
      this.rebuildIndex(col);
    }
    
    // Delete records
    for (const idx of indices) {
      this.data.splice(idx, 1);
    }
    
    if (indices.length > 0) {
      this.save();
      this.saveIndexes();
    }
    
    return indices.length;
  }

  createIndex(column) {
    if (!this.schema[column]) {
      throw new Error(`Column '${column}' does not exist`);
    }
    
    this.indexes[column] = {};
    this.rebuildIndex(column);
    this.saveIndexes();
    return true;
  }

  rebuildIndex(column) {
    this.indexes[column] = {};
    for (let i = 0; i < this.data.length; i++) {
      const value = this.data[i][column];
      if (value !== undefined) {
        if (!this.indexes[column][value]) this.indexes[column][value] = [];
        this.indexes[column][value].push(i);
      }
    }
  }

  drop() {
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
      if (fs.existsSync(this.indexPath)) fs.unlinkSync(this.indexPath);
    } catch (error) {
      console.error('Error dropping table:', error);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      this.data = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving table:', error);
    }
  }

  loadIndexes() {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf8');
        this.indexes = JSON.parse(raw);
      }
    } catch (error) {
      this.indexes = {};
    }
  }

  saveIndexes() {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.indexes, null, 2));
    } catch (error) {
      console.error('Error saving indexes:', error);
    }
  }
}

module.exports = Table;