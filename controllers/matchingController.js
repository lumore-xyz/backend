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

// @desc    Get saved chats for a user
// @route   GET /api/matching/saved-chats
// @access  Private
export const getSavedChats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("savedChats.match", "username profilePicture")
      .select("savedChats");

    res.json(user.savedChats);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Toggle profile visibility for a match
// @route   POST /api/matching/toggle-profile-visibility/:matchId
// @access  Private
export const toggleProfileVisibility = async (req, res) => {
  try {
    const { isVisible } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.fieldVisibility = isVisible;
    await user.save();

    res.json({ fieldVisibility: isVisible });
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

// @desc    Get user's daily conversation count
// @route   GET /api/matching/conversation-count
// @access  Private
export const getConversationCount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "dailyConversations lastConversationReset"
    );

    res.json({
      dailyConversations: user.dailyConversations, // do we even have this in user schema?
      lastReset: user.lastConversationReset,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
