const DayPlan = require("../models/DayPlan");

// @desc    Get day plan for a specific date (create empty if none exists)
// @route   GET /api/personal/planner?date=YYYY-MM-DD
// @access  Private
const getDayPlan = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Valid date (YYYY-MM-DD) is required" });
    }

    // Try to find existing plan
    let dayPlan = await DayPlan.findOne({
      ownerUserId: req.user._id,
      date: date,
    });

    // If no plan exists, create an empty one
    if (!dayPlan) {
      dayPlan = await DayPlan.create({
        ownerUserId: req.user._id,
        date: date,
        timezone: req.body.timezone || "UTC",
        blocks: [],
      });
    }

    res.json(dayPlan);
  } catch (error) {
    console.error("Error fetching day plan:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Upsert whole day plan (replace blocks array)
// @route   PUT /api/personal/planner?date=YYYY-MM-DD
// @access  Private
const upsertDayPlan = async (req, res) => {
  try {
    const { date } = req.query;
    const { blocks } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "Valid date (YYYY-MM-DD) is required" });
    }

    if (!Array.isArray(blocks)) {
      return res.status(400).json({ message: "blocks must be an array" });
    }

    // Validate blocks
    for (const block of blocks) {
      if (!block.id || !block.start || !block.end || !block.title) {
        return res.status(400).json({ message: "Each block must have id, start, end, and title" });
      }

      // Validate time format
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(block.start) || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(block.end)) {
        return res.status(400).json({ message: "Invalid time format. Use HH:mm" });
      }

      // Validate start < end
      const [startHour, startMin] = block.start.split(":").map(Number);
      const [endHour, endMin] = block.end.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        return res.status(400).json({ message: "Block end time must be after start time" });
      }

      // Validate status
      if (block.status && !["planned", "done", "skipped"].includes(block.status)) {
        return res.status(400).json({ message: "Invalid status. Must be planned, done, or skipped" });
      }

      // Validate colorTag
      if (block.colorTag && !["none", "blue", "purple", "green", "orange"].includes(block.colorTag)) {
        return res.status(400).json({ message: "Invalid colorTag" });
      }
    }

    // Check for overlapping blocks
    const sortedBlocks = [...blocks].sort((a, b) => {
      const [aHour, aMin] = a.start.split(":").map(Number);
      const [bHour, bMin] = b.start.split(":").map(Number);
      return aHour * 60 + aMin - (bHour * 60 + bMin);
    });

    for (let i = 0; i < sortedBlocks.length - 1; i++) {
      const current = sortedBlocks[i];
      const next = sortedBlocks[i + 1];

      const [currentEndHour, currentEndMin] = current.end.split(":").map(Number);
      const [nextStartHour, nextStartMin] = next.start.split(":").map(Number);
      const currentEndMinutes = currentEndHour * 60 + currentEndMin;
      const nextStartMinutes = nextStartHour * 60 + nextStartMin;

      if (currentEndMinutes > nextStartMinutes) {
        return res.status(400).json({
          message: `Block "${current.title}" overlaps with "${next.title}"`,
        });
      }
    }

    // Upsert the plan
    const dayPlan = await DayPlan.findOneAndUpdate(
      {
        ownerUserId: req.user._id,
        date: date,
      },
      {
        ownerUserId: req.user._id,
        date: date,
        timezone: req.body.timezone || "UTC",
        blocks: blocks,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.json(dayPlan);
  } catch (error) {
    console.error("Error upserting day plan:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({ message: "Duplicate day plan entry" });
    }
    
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update a single block
// @route   PATCH /api/personal/planner/block/:blockId
// @access  Private
const updateBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const updates = req.body;

    if (!blockId) {
      return res.status(400).json({ message: "blockId is required" });
    }

    // Find the day plan containing this block
    const dayPlan = await DayPlan.findOne({
      ownerUserId: req.user._id,
      "blocks.id": blockId,
    });

    if (!dayPlan) {
      return res.status(404).json({ message: "Block not found" });
    }

    // Find the block index
    const blockIndex = dayPlan.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      return res.status(404).json({ message: "Block not found" });
    }

    // Update the block
    const block = dayPlan.blocks[blockIndex];
    
    if (updates.start !== undefined) {
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(updates.start)) {
        return res.status(400).json({ message: "Invalid start time format" });
      }
      block.start = updates.start;
    }

    if (updates.end !== undefined) {
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(updates.end)) {
        return res.status(400).json({ message: "Invalid end time format" });
      }
      block.end = updates.end;
    }

    if (updates.title !== undefined) block.title = updates.title.trim();
    if (updates.note !== undefined) block.note = updates.note.trim();
    if (updates.taskId !== undefined) block.taskId = updates.taskId || null;
    if (updates.status !== undefined) {
      if (!["planned", "done", "skipped"].includes(updates.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      block.status = updates.status;
    }
    if (updates.colorTag !== undefined) {
      if (!["none", "blue", "purple", "green", "orange"].includes(updates.colorTag)) {
        return res.status(400).json({ message: "Invalid colorTag" });
      }
      block.colorTag = updates.colorTag;
    }

    // Validate start < end
    const [startHour, startMin] = block.start.split(":").map(Number);
    const [endHour, endMin] = block.end.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      return res.status(400).json({ message: "Block end time must be after start time" });
    }

    // Check for overlaps with other blocks (excluding current block)
    const otherBlocks = dayPlan.blocks.filter((b, idx) => idx !== blockIndex);
    for (const otherBlock of otherBlocks) {
      const [otherStartHour, otherStartMin] = otherBlock.start.split(":").map(Number);
      const [otherEndHour, otherEndMin] = otherBlock.end.split(":").map(Number);
      const otherStartMinutes = otherStartHour * 60 + otherStartMin;
      const otherEndMinutes = otherEndHour * 60 + otherEndMin;

      if (
        (startMinutes < otherEndMinutes && endMinutes > otherStartMinutes)
      ) {
        return res.status(400).json({
          message: `Block overlaps with "${otherBlock.title}"`,
        });
      }
    }

    await dayPlan.save();

    res.json(dayPlan);
  } catch (error) {
    console.error("Error updating block:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getDayPlan,
  upsertDayPlan,
  updateBlock,
};

