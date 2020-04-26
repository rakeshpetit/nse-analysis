
import { getURLs } from './getDates'
import { downloadUrl } from './downloadUrl'
const startingDateStr = '01/01/2020'
const endingDateStr = '01/01/2020'

const urls = getURLs(startingDateStr, endingDateStr)

urls.map(url => {
    console.log(url)
    // downloadUrl(url)
})
