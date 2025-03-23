import User from "../models/User.js";
import matchingService from "../services/matchingService.js";

// @desc    Find potential matches for a user
// @route   GET /api/matching/potential-matches
// @access  Private
export const findPotentialMatches = async (req, res) => {
  try {
    const matches = await matchingService.findPotentialMatches(req.user._id);
    res.json(matches);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Create a match between two users
// @route   POST /api/matching/create-match/:userId
// @access  Private
export const createMatch = async (req, res) => {
  try {
    const match = await matchingService.createMatch(
      req.user._id,
      req.params.userId
    );
    res.json(match);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    End a match between two users
// @route   POST /api/matching/end-match/:userId
// @access  Private
export const endMatch = async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await matchingService.endMatch(
      req.user._id,
      req.params.userId,
      reason
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get user's active match
// @route   GET /api/matching/active-match
// @access  Private
export const getActiveMatch = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("activeMatch", "username profilePicture")
      .select("activeMatch");

    res.json(user.activeMatch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Reject a profile
// @route   POST /api/matching/reject-profile/:userId
// @access  Private
export const rejectProfile = async (req, res) => {
  try {
    const result = await matchingService.rejectProfile(
      req.user._id,
      req.params.userId
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
