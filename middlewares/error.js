const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === "ValidationError") {
    return res
      .status(400)
      .json({ message: "Validation error", errors: err.errors });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  res.status(500).json({ message: "Something went wrong" });
};

module.exports = errorHandler;
