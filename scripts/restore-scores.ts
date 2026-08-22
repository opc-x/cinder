import { ready } from "../lib/db";
import { retagLibrary } from "../lib/retag";

ready()
  .then(() => retagLibrary())
  .then((n) => {
    console.log("retag", n);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
