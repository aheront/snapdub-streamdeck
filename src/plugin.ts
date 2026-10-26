import streamDeck from "@elgato/streamdeck";

import { ClipLink } from "./actions/clip-link";
import { Credits } from "./actions/credits";

// "info", not "trace": trace records every message, and the settings messages carry the sign-in tokens.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ClipLink());
streamDeck.actions.registerAction(new Credits());

streamDeck.connect();
