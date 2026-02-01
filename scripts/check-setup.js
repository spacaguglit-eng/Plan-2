// Скрипт для проверки настройки проекта
import fs from 'fs';
import path from 'path';

console.log('🔍 Проверка настройки проекта...\n');

// Проверка файлов
const files = [
  'package.json',
  'tailwind.config.js',
  'postcss.config.js',
  'vite.config.js',
  'index.css',
  'main.jsx',
  'App.jsx',
  'index.html'
];

let allOk = true;

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} - найден`);
  } else {
    console.log(`❌ ${file} - НЕ НАЙДЕН`);
    allOk = false;
  }
});

// Проверка tailwind.config.js
if (fs.existsSync('tailwind.config.js')) {
  const content = fs.readFileSync('tailwind.config.js', 'utf-8');
  if (content.includes('App.jsx')) {
    console.log('✅ tailwind.config.js содержит App.jsx');
  } else {
    console.log('❌ tailwind.config.js НЕ содержит App.jsx');
    allOk = false;
  }
}

// Проверка node_modules
if (fs.existsSync('node_modules')) {
  console.log('✅ node_modules - установлен');
} else {
  console.log('⚠️  node_modules - НЕ установлен. Запустите: npm install');
  allOk = false;
}

console.log('\n' + (allOk ? '✅ Все проверки пройдены!' : '❌ Есть проблемы'));
console.log('\n📝 Следующие шаги:');
console.log('1. Остановите dev сервер (Ctrl+C)');
console.log('2. Очистите кэш браузера (Ctrl+Shift+R)');
console.log('3. Запустите: npm run dev');
console.log('4. Откройте адрес из терминала в браузере');
