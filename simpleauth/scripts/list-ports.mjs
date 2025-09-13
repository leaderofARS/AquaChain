import { SerialPort } from 'serialport';

SerialPort.list().then((ports) => {
  for (const p of ports) {
    console.log(`${p.path} - ${p.manufacturer || ''} ${p.friendlyName || ''}`.trim());
  }
}).catch((e) => {
  console.error('Failed to list ports:', e.message);
  process.exit(1);
});

