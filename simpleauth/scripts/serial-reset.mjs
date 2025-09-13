import 'dotenv/config';
import { SerialPort } from 'serialport';

const portPath = process.env.SERIAL_PORT || 'COM3';
const baudRate = Number(process.env.SERIAL_BAUD || 115200);

const port = new SerialPort({ path: portPath, baudRate, autoOpen: true });

port.on('open', async () => {
  console.log(`[serial] Opened ${portPath} @ ${baudRate}`);
  try {
    await port.set({ dtr: false, rts: true });
    await new Promise(r => setTimeout(r, 50));
    await port.set({ dtr: true, rts: false });
    await new Promise(r => setTimeout(r, 50));
    await port.set({ dtr: true, rts: true });
    console.log('[serial] DTR/RTS toggled for reset');
  } catch (e) {
    console.warn('[serial] Reset toggle failed:', e.message);
  } finally {
    setTimeout(() => port.close(() => process.exit(0)), 200);
  }
});

port.on('error', (err) => {
  console.error('[serial] Error:', err.message);
  process.exit(1);
});

