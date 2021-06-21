import "./floodfill"
import { CanvasTurtle } from "./turtle.js"
import {LogoInterpreter} from "./logo.js"

export  {CanvasTurtle, LogoInterpreter}

window._attachJsLogo = () => {
  window.CanvasTurtle = CanvasTurtle;
  window.LogoInterpreter = LogoInterpreter;
}