
import async from 'async'
import { downloadUrl } from './downloadUrl'

const downloadAsync = (urls) => {
    async.eachLimit(urls, 1, function ({ url, fileName, filePath }, cb = () => { }) {
        downloadUrl(url, fileName, filePath)
        setTimeout(() => {
            cb()
        }, 500)
    }, (err, results) => {
        if (err) {
            console.log(err)
        }
        // results is now an array of the response bodies
        // console.log(results)
    })
}

export { downloadAsync }