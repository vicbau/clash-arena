const mongoose = require('mongoose');

const cardStatSchema = new mongoose.Schema({
  cardName: {
    type: String,
    required: true,
    unique: true
  },
  cardKey: {
    type: String,
    required: true
  },
  // Image filename (to be mapped on frontend)
  imageFile: {
    type: String,
    default: ''
  },
  // Total times this card was used in matches
  totalUses: {
    type: Number,
    default: 0
  },
  // Total wins when this card was in the deck
  wins: {
    type: Number,
    default: 0
  },
  // Total losses when this card was in the deck
  losses: {
    type: Number,
    default: 0
  },
  // Battle type breakdown
  battleTypes: {
    classic: { uses: { type: Number, default: 0 }, wins: { type: Number, default: 0 } },
    challenge: { uses: { type: Number, default: 0 }, wins: { type: Number, default: 0 } },
    friendly: { uses: { type: Number, default: 0 }, wins: { type: Number, default: 0 } },
    other: { uses: { type: Number, default: 0 }, wins: { type: Number, default: 0 } }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Virtual for win rate
cardStatSchema.virtual('winRate').get(function() {
  const total = this.wins + this.losses;
  if (total === 0) return 0;
  return Math.round((this.wins / total) * 100);
});

// Virtual for usage (will be calculated relative to total matches)
cardStatSchema.virtual('matches').get(function() {
  return this.wins + this.losses;
});

module.exports = mongoose.model('CardStat', cardStatSchema);
