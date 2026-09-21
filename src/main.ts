import "./styles.css";
import { applyProductMetadata } from "./components";

applyProductMetadata();
const bootPath = "/js/boot.js";
void import(/* @vite-ignore */ bootPath);
