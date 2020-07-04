import fs from 'fs'

const fetchListJSONdata = (year) => {
    return new Promise((resolve, reject) => {
        fs.readFile(`list${year}.json`, 'utf8', function readFileCallback(err, data) {
            if (err) {
                console.log(err);
                reject(err)
            } else {
                const obj = JSON.parse(data); 
                resolve(obj)
            }
        });
    })
}

export { fetchListJSONdata }