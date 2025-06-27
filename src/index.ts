import config from './config.js';
import app from './server.js';

app.listen(config.PORT, () => {
  console.log(`App listening on port ${config.PORT.toString()}`);
});
