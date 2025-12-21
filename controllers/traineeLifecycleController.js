const Trainee = require("../models/Trainee");

// PATCH /api/hr/trainees/:id/pause
async function pauseTrainee(req, res) {
  try {
    const { reason, pauseUntil } = req.body;
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "paused",
        pausedAt: new Date(),
        pauseUntil: pauseUntil ? new Date(pauseUntil) : null,
        pausedReason: reason || "",
        pausedBy: req.user._id,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Trainee paused", trainee: updatedTrainee });
  } catch (err) {
    console.error("pauseTrainee error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/freeze
async function freezeTrainee(req, res) {
  try {
    const { reason, freezeUntil } = req.body;
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "frozen",
        frozenAt: new Date(),
        freezeUntil: freezeUntil ? new Date(freezeUntil) : null,
        frozenReason: reason || "",
        frozenBy: req.user._id,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Trainee frozen", trainee: updatedTrainee });
  } catch (err) {
    console.error("freezeTrainee error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/resume
async function resumeTrainee(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    if (trainee.status !== "paused" && trainee.status !== "frozen") {
      return res.status(400).json({ message: "Trainee is not paused or frozen" });
    }

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "trial",
        pausedAt: null,
        pauseUntil: null,
        pausedReason: "",
        pausedBy: null,
        frozenAt: null,
        freezeUntil: null,
        frozenReason: "",
        frozenBy: null,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Trainee resumed to trial status", trainee: updatedTrainee });
  } catch (err) {
    console.error("resumeTrainee error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/cancel
async function cancelTrainee(req, res) {
  try {
    const { reason } = req.body;
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason || "",
        cancelledBy: req.user._id,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Trainee training cancelled", trainee: updatedTrainee });
  } catch (err) {
    console.error("cancelTrainee error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// POST /api/trainee/me/withdraw-request
async function requestWithdraw(req, res) {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ message: "Withdrawal reason must be at least 5 characters" });
    }

    const trainee = await Trainee.findOne({ userId: req.user._id });
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      trainee._id,
      {
        status: "withdraw_requested",
        withdrawRequestedAt: new Date(),
        withdrawReason: reason,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Withdrawal request submitted", trainee: updatedTrainee });
  } catch (err) {
    console.error("requestWithdraw error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/withdraw/approve
async function approveWithdraw(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    if (trainee.status !== "withdraw_requested") {
      return res.status(400).json({ message: "Trainee has not requested withdrawal" });
    }

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "withdrawn",
        withdrawnAt: new Date(),
        withdrawnBy: req.user._id,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Withdrawal approved", trainee: updatedTrainee });
  } catch (err) {
    console.error("approveWithdraw error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/withdraw/reject
async function rejectWithdraw(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    if (trainee.status !== "withdraw_requested") {
      return res.status(400).json({ message: "Trainee has not requested withdrawal" });
    }

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "trial",
        withdrawRequestedAt: null,
        withdrawReason: "",
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Withdrawal rejected, trainee resumed to trial", trainee: updatedTrainee });
  } catch (err) {
    console.error("rejectWithdraw error", err);
    res.status(500).json({ message: "Server error" });
  }
}

// PATCH /api/hr/trainees/:id/revert-cancel
async function revertCancel(req, res) {
  try {
    const trainee = await Trainee.findById(req.params.id);
    if (!trainee) return res.status(404).json({ message: "Trainee not found" });

    if (trainee.status !== "cancelled") {
      return res.status(400).json({ message: "Trainee is not in cancelled status" });
    }

    const updatedTrainee = await Trainee.findByIdAndUpdate(
      req.params.id,
      {
        status: "trial",
        cancelledAt: null,
        cancelReason: "",
        cancelledBy: null,
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    res.json({ message: "Cancellation reverted, trainee resumed to trial", trainee: updatedTrainee });
  } catch (err) {
    console.error("revertCancel error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  pauseTrainee,
  freezeTrainee,
  resumeTrainee,
  cancelTrainee,
  requestWithdraw,
  approveWithdraw,
  rejectWithdraw,
  revertCancel,
};
