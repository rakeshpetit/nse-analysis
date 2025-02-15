import async from "async";
import { downloadUrl } from "./downloadUrl";
import { unZip } from "./unzipFile";

const downloadAsync = (urls) => {
  async.eachLimit(
    urls,
    1,
    function ({ url, fileName, filePath }, cb = () => {}) {
      const result = downloadUrl(url, fileName, filePath);
      if (result) {
        cb();
      } else {
        setTimeout(() => {
          cb();
        }, 500);
      }
    },
    (err, results) => {
      if (err) {
        console.log(err);
      }
      // results is now an array of the response bodies
      // console.log(results)
    }
  );
};

const unZipAsync = (urls) => {
  async.eachLimit(
    urls,
    10,
    function ({ url, fileName, filePath }, cb = () => {}) {
      const result = unZip(url, fileName, filePath);
      if (result) {
        cb();
      } else {
        setTimeout(() => {
          cb();
        }, 50);
      }
    },
    (err, results) => {
      if (err) {
        console.log(err);
      }
      // results is now an array of the response bodies
      // console.log(results)
    }
  );
};

export { downloadAsync, unZipAsync };
