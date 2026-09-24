import 'dotenv/config';
import { app, initDb } from './server/app.ts';

const port = Number(process.env.PORT || 3000);

await initDb();

app.listen(port, '0.0.0.0', () =>
  console.log(`INFOR IEST API running on http://localhost:${port}`)
);
