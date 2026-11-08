import "./styles.css";
import { applyProductMetadata } from "./components";

applyProductMetadata();
const bootPath = "/js/boot.js";
void import(/* @vite-ignore */ bootPath);

const controlsPath = "/js/native/components.js";
void import(/* @vite-ignore */ controlsPath).then(module => module.installNativeControls());
