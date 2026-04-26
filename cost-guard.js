let counter = 0;

setInterval(() => {
  counter = 0;
}, 60000);

module.exports = function costGuard(req, res, next) {
  counter++;

  if (counter > 100) {
    return res.status(503).send("cost limit reached");
  }

  next();
};
