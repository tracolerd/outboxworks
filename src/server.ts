import { app } from './api.js';
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 OutboxWorks API Server running on port ${PORT}`);
});
