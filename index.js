
import async from 'async'
import { getURLs } from './getDates'
import { downloadUrl } from './downloadUrl'
const startingDateStr = '01/01/2020'
const endingDateStr = '05/01/2020'

const urls = getURLs(startingDateStr, endingDateStr)

console.log(urls)
async.eachLimit(urls, 1,  function ({ url, fileName, filePath}, cb = () => {}) {
    downloadUrl(url, fileName, filePath)
     setTimeout(() => {        
         cb()
    }, 500)
}, (err, results) => {
    if (err){
        console.log(err)
    }
    // results is now an array of the response bodies
    // console.log(results)
})
