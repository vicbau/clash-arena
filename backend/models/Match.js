const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  player1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  player2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  player1Declared: {
    type: String,
    enum: ['win', 'loss', null],
    default: null
  },
  player2Declared: {
    type: String,
    enum: ['win', 'loss', null],
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'disputed'],
    default: 'pending'
  },
  trophiesExchanged: {
    type: Number,
    default: 30
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Match', matchSchema);
