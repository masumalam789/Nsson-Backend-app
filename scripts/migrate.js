'use strict';

/**
 * Universal Schema Migration Script
 * ──────────────────────────────────
 * Inspects a Mongoose model's schema and backfills any fields that exist in
 * the schema (with a defined default) onto existing documents that are missing
 * those fields in the database.
 *
 * Usage:
 *   node scripts/migrate.js --model=User
 *   node scripts/migrate.js --model=Product
 *   node scripts/migrate.js --model=Order
 *   node scripts/migrate.js --model=all          ← run against every model
 *
 * Options:
 *   --model=<ModelName>   Name of the model file inside src/models/ (case-insensitive)
 *   --dry-run             Print what would be updated without writing to DB
 *   --verbose             Log each field being checked
 *
 * Examples:
 *   node scripts/migrate.js --model=User --dry-run
 *   node scripts/migrate.js --model=all --verbose
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ─── Parse CLI args ───────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, val] = arg.replace(/^--/, '').split('=');
    return [key, val ?? true];
  })
);

const modelArg = (args.model || '').toLowerCase();
const isDryRun = Boolean(args['dry-run']);
const isVerbose = Boolean(args.verbose);

if (!modelArg) {
  console.error('❌  Usage: node scripts/migrate.js --model=<ModelName|all>');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODELS_DIR = path.join(__dirname, '..', 'src', 'models');

/** Load all model file names from src/models/ */
function getAvailableModels() {
  return fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => f.replace('.js', ''));
}

/** Require a model by its file name (case-insensitive match) */
function loadModel(name) {
  const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.js'));
  const match = files.find(f => f.toLowerCase() === `${name.toLowerCase()}.js`);
  if (!match) throw new Error(`Model file not found: ${name}.js in src/models/`);
  return require(path.join(MODELS_DIR, match));
}

/**
 * Recursively walk a Mongoose schema and collect paths that have a default
 * value defined. Returns an object: { 'field.path': defaultValue }.
 */
function collectDefaults(schema, prefix = '') {
  const defaults = {};

  schema.eachPath((pathName, schemaType) => {
    const fullPath = prefix ? `${prefix}.${pathName}` : pathName;

    // Skip internal Mongoose paths
    if (['_id', '__v', 'id'].includes(pathName)) return;

    const hasDefault = schemaType.options && schemaType.options.default !== undefined;
    if (hasDefault) {
      const dflt = schemaType.options.default;
      defaults[fullPath] = typeof dflt === 'function' ? dflt() : dflt;
    }

    // Recurse into nested schemas
    if (schemaType.schema) {
      const nested = collectDefaults(schemaType.schema, fullPath);
      Object.assign(defaults, nested);
    }
  });

  return defaults;
}

// ─── Core migration logic ─────────────────────────────────────────────────────

async function migrateModel(Model) {
  const modelName = Model.modelName;
  const collection = Model.collection;
  const fieldDefaults = collectDefaults(Model.schema);

  if (isVerbose) {
    console.log(`\n  Schema fields with defaults for [${modelName}]:`);
    for (const [field, dflt] of Object.entries(fieldDefaults)) {
      console.log(`    • ${field}: ${JSON.stringify(dflt)}`);
    }
  }

  if (Object.keys(fieldDefaults).length === 0) {
    console.log(`  ⚠️  [${modelName}] No fields with defaults found in schema — nothing to migrate.`);
    return;
  }

  let totalModified = 0;

  for (const [field, defaultValue] of Object.entries(fieldDefaults)) {
    // Find documents where the field does not exist at all
    const filter = { [field]: { $exists: false } };
    const count = await collection.countDocuments(filter);

    if (count === 0) {
      if (isVerbose) console.log(`  ✅  [${modelName}].${field} — all documents already have this field`);
      continue;
    }

    console.log(`  🔧  [${modelName}].${field} — ${count} document(s) missing → will set to ${JSON.stringify(defaultValue)}`);

    if (!isDryRun) {
      const result = await collection.updateMany(
        filter,
        { $set: { [field]: defaultValue } }
      );
      totalModified += result.modifiedCount;
      console.log(`      ↳  Modified: ${result.modifiedCount}`);
    }
  }

  if (isDryRun) {
    console.log(`  🟡  [${modelName}] Dry-run — no changes written.`);
  } else {
    console.log(`  ✅  [${modelName}] Done. Total documents modified: ${totalModified}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌  MONGO_URI is not set in your .env file');
    process.exit(1);
  }

  if (isDryRun) console.log('\n🟡  DRY-RUN mode — no changes will be written to the database.\n');

  console.log('🔗  Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅  Connected\n');

  const availableModels = getAvailableModels();

  let modelNames = [];

  if (modelArg === 'all') {
    modelNames = availableModels;
    console.log(`📋  Running migration on all models: ${modelNames.join(', ')}\n`);
  } else {
    // Support comma-separated list: --model=User,Product,Order
    modelNames = modelArg.split(',').map(s => s.trim());
  }

  for (const name of modelNames) {
    console.log(`─── Migrating: ${name} ${'─'.repeat(Math.max(0, 40 - name.length))}`);
    try {
      const Model = loadModel(name);
      await migrateModel(Model);
    } catch (err) {
      console.error(`  ❌  Failed for [${name}]: ${err.message}`);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('🔌  Disconnected from MongoDB');
}

main().catch(err => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
