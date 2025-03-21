import slotService from "../services/slotService.js";

// @desc    Create a new slot for a match
// @route   POST /api/slots/create/:matchId
// @access  Private
export const createSlot = async (req, res) => {
  try {
    const slot = await slotService.createSlot(req.user._id, req.params.matchId);
    res.status(201).json(slot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all active slots for a user
// @route   GET /api/slots
// @access  Private
export const getUserSlots = async (req, res) => {
  try {
    const slots = await slotService.getUserSlots(req.user._id);
    res.json(slots);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get slot by ID
// @route   GET /api/slots/:slotId
// @access  Private
export const getSlotById = async (req, res) => {
  try {
    const slot = await slotService.getSlotById(req.params.slotId);
    if (!slot) {
      return res.status(404).json({ message: "Slot not found" });
    }
    res.json(slot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Add message to slot chat history
// @route   POST /api/slots/:slotId/messages
// @access  Private
export const addMessageToSlot = async (req, res) => {
  try {
    const { content } = req.body;
    const message = await slotService.addMessageToSlot(
      req.params.slotId,
      req.user._id,
      content
    );
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Mark slot messages as read
// @route   POST /api/slots/:slotId/read
// @access  Private
export const markSlotAsRead = async (req, res) => {
  try {
    await slotService.markSlotAsRead(req.params.slotId);
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update slot notes
// @route   PUT /api/slots/:slotId/notes
// @access  Private
export const updateSlotNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const slot = await slotService.updateSlotNotes(req.params.slotId, notes);
    res.json(slot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Add tags to slot
// @route   POST /api/slots/:slotId/tags
// @access  Private
export const addSlotTags = async (req, res) => {
  try {
    const { tags } = req.body;
    const slot = await slotService.addSlotTags(req.params.slotId, tags);
    res.json(slot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Deactivate a slot
// @route   POST /api/slots/:slotId/deactivate
// @access  Private
export const deactivateSlot = async (req, res) => {
  try {
    const slot = await slotService.deactivateSlot(req.params.slotId);
    res.json(slot);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
