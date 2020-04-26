import { getURLs } from './getDates'
import { downloadAsync } from './downloadAsync'
const startingDateStr = '01/01/2019'
const endingDateStr = '05/01/2019'

const urls = getURLs(startingDateStr, endingDateStr)
console.log(urls)
downloadAsync(urls)

// zip.on('ready', () => {
//     fs.mkdirSync('extracted');
//     zip.extract(null, './extracted', (err, count) => {
//         console.log(err ? 'Extract error' : `Extracted ${count} entries`);
//         zip.close();
//     });
// });