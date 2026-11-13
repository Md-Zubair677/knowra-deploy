const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

const toPublicUser = (user) => ({
  _id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

const register = async ({ name, email, password, role = 'student' }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new ApiError(409, 'Email is already registered');

  const user = await User.create({ name, email, password, role });
  return toPublicUser(user);
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  return { token: createToken(user), user: toPublicUser(user) };
};

const getCurrentUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, 'Invalid token');
  return toPublicUser(user);
};

module.exports = { register, login, getCurrentUser };
