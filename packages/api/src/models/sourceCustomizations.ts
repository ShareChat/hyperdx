import mongoose from 'mongoose';

/**
 * Fork-specific fields added to the base Source Mongoose schema.
 * Add new custom fields here — source.ts spreads this in and stays otherwise
 * untouched, making upstream merges easier.
 * See CUSTOMIZATIONS.md for intent and documentation.
 */
export const sourceCustomFields: mongoose.SchemaDefinition = {
  defaultFilters: {
    type: mongoose.Schema.Types.Array,
  },
};
