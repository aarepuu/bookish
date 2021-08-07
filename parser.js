import _map from 'lodash/map';
import _each from 'lodash/each';

import React from 'react';
import { Link } from 'react-router-dom';
import { NavHashLink } from "react-router-hash-link";
import { Figure } from './views/image';
import { Marginal } from './views/marginal';
import { Code } from './views/code';

// TODO This grammar is slightly out of date.
// A simple recursive descent parser for this grammar.
// Embeds a tokenizer, since the lexical grammar is simple.
//
// CHAPTER :: SYMBOLS* (BLOCK\n)*
// SYMBOLS :: @name: BLOCK
// BLOCK :: (COMMENT | HEADER | RULE | EMBED | ORDERED | UNORDERED | CODE | QUOTE | PARAGRAPH)
// COMMENT :: %.+
// HEADER :: # CONTENT | ## CONTENT | ### CONTENT
// RULE :: ---
// EMBED :: |TEXT|TEXT|CONTENT|CONTENT|
// ORDERED :: (* CONTENT)+
// UNORDERED :: ([0-9]+. CONTENT)+
// CODE :: `\nTEXT`
// QUOTE :: "\nBLOCK*\n"CONTENT
// TABLE :: ((,CONTENT)+\n)+
// CODE :: `\nTEXT\n`
// PARAGRAPH :: CONTENT
// CONTENT :: FORMATTED | CITATIONS | ESCAPED | LINK | FOOTNOTE | SYMBOL | DEFINITION
// FORMATTED :: *CONTENT* | _CONTENT_ | `CONTENT`
// CITATIONS || <TEXT+,>
// ESCAPED :: \[char]
// LINK :: [CONTENT|TEXT]
// FOOTNOTE :: {TEXT}
// TEXT :: (.+)
class Parser {

    constructor(text) {
        if(typeof text !== "string")
            throw "Parser expected a string but received " + typeof text;

        this.text = text;

        // Start at the first character.
        this.index = 0;

        // Track most recently observed quotes.
        this.openedDoubleQuote = false;

    }

    static parseChapter(text, symbols = {}) {
        return (new Parser(text)).parseChapter(symbols);
    }

    static parseContent(text) {
        return (new Parser(text)).parseContent();
    }

    static parseEmbed(text) {
        return (new Parser(text)).parseEmbed();
    }

    static parseReference(ref, app, short=false) {

        var dom = null;

        if(typeof ref === "string")
            dom = Parser.parseContent(ref).toDOM();
        else if(Array.isArray(ref)) {
            // APA Format. Could eventually suppport multiple formats.
            if(ref.length >= 4) {
                let authors = ref[0];
                let year = ref[1];
                let title = ref[2];
                let source = ref[3];
                let url = ref.length === 5 ? ref[4] : null;
                let summary = ref.length === 6 ? ref[5] : null;
                // Convert sources using the source mapping. Yay consistency!
                if(source.charAt(0) === "#") {
                    source = app.getSource(source);
                    if(source === null)
                        source = <span className="alert alert-danger">Unknown source <code>{ref[3]}</code></span>;
                }

                // If a short version was requested, try to abbreviate the authors.
                if(short) {
                    authors = authors.split(",");
                    if(authors.length > 1)
                        authors = authors[0].trim() + ", et al.";
                    else   
                        authors = authors[0];
                    dom = <span className="reference-text">{authors} ({year}). {url === null ? title : <a href={url} target={"_blank"}>{title}</a>}{title.charAt(title.length - 1) === "?" ? "" : "."} <em>{source}</em></span>
                }
                else
                    dom = <span className="reference-text">{authors} ({year}). {url === null ? title : <a href={url} target={"_blank"}>{title}</a>}{title.charAt(title.length - 1) === "?" ? "" : "."} <em>{source}</em>.{summary ? <span className="summary">{summary}</span> : null }</span>
            }
            else
                dom = <span className="alert alert-danger">Expected at least 4 items in the reference array, but found {ref.length}: <code>{ref.toString()}</code></span>
        }
        else
            dom = <span className="alert alert-danger">Invalid reference: <code>{"" + ref}</code></span>

        return dom;

    }

    // Get the next character, if there is one, null otherwise.
    peek() { 
        return this.more() ? this.text.charAt(this.index) : null; 
    }
    
    // True if there are more characters to parse.
    more() { 
        return this.index < this.text.length; 
    }

    // Return the current character--if there is one-- and increment the index.
	read(smarten=true) { 
		if(!this.more())
            return null;
        
        var char = this.text.charAt(this.index);

        if(smarten) {
            if(char === "\n")
                this.openedDoubleQuote = false;

            // As we read, replace straight quotes with smart quotes.
            if(char === '"') {
                // Replace left quotes after whitespace.
                if(this.openedDoubleQuote) {
                    char = "\u201d";
                }
                else {
                    char = "\u201c";
                }
                this.openedDoubleQuote = !this.openedDoubleQuote;
            } else if(char === "'") {
                // If there's whitespace before this, it's a left single quote.
                if(/\s/.test(this.text.charAt(this.index - 1)))
                    char = "\u2018";
                // Otherwise, it's a right single quote.
                else {
                    char = "\u2019";
                }
            }

            if(char === '-' && this.text.charAt(this.index + 1) === '-' && this.text.charAt(this.index) !== '\n') {
                this.index++;
                char = "\u2014";
            }
        }

        // Advance to the next character in the document.
        this.index++;

        return char;
    }

    unread() {
        this.index--;
    }

    // All of the text including and after the current index.
    rest() {
        return this.text.substring(this.index);
    }

    // The character before
    charBeforeNext() {
        return this.index === 0 ? null : this.text.charAt(this.index - 1);
    }
    
    // All the text until the next newline
    restOfLine() {
        var nextNewline = this.text.substring(this.index).indexOf("\n") + this.index;
        if(nextNewline < 0)
            return this.text.substring(this.index);
        else  
            return this.text.substring(this.index, Math.max(this.index, nextNewline));
    }

    // True if the given string is occurs next in the text.
    nextIs(string) {
        if(!this.more())
            return false;
        return this.text.substring(this.index, this.index + string.length) === string;
    }

    // A critical list that tells inline formatting parsers to stop being greedy.
    nextIsContentDelimiter() {

        var next = this.peek();
        return next === "\n" ||
            next === "_" ||
            next === "*" ||
            next === "`" ||
            next === "@" ||
            next === "~" ||
            next === "^" ||
            next === "<" ||
            next === "{" ||
            (this.charBeforeNext() === " " && next === "%") ||
            next === "[" ||
            next === "\\";

    }

    // True if the next part of this string matches the given regular expression.
    nextMatches(regex) {
        if(!this.more())
            return false;
        return regex.test(this.rest());
    }

    // Returns true if all of the text between the current character and the next newline is whitespace.
    isBlankLine() {
        return this.restOfLine().trim() === "";
    }

    // Read until encountering something other than a tab or a space.
    readWhitespace() {
        while(this.more() && /^[ \t]/.test(this.peek()))
            this.read();
    }

    // Read until the end of the line.
    readUntilNewLine() {
        var text = "";
        while(this.more() && this.peek() !== "\n")
            text = text + this.read();
        return text;
    }

    // Read until encountering the given string and return the read text.
    readUntilNewlineOr(string) {
        var text = "";
        while(this.more() && !this.nextIs("\n") && !this.nextIs(string))
            text = text + this.read();
        return text;
    }

    parseChapter(symbols = {}) {

        let blocks = [];

        // We pass this to all parsing functions to gather information strewn about the document.
        let metadata = {
            citations: {},
            footnotes: [],
            headers: [],
            symbols: {},
            errors: []
        };

        // Read any symbols declared for this chapter.
        this.parseSymbols(metadata);

        // Get the remaining text.
        let declarations = this.text.substring(0, this.index);
        let rest = this.rest();
        
        // First, replace any occurrences of the symbol with the symbol's text.
        for(const [symbol, text] of Object.entries(metadata.symbols)) {
            rest = rest.replace(new RegExp("([^\\\\])@" + symbol + "\\b", "g"), "$1" + text);
        }

        // Then replace any remaining symbols with any definitions given.
        for(const [symbol, text] of Object.entries(symbols)) {
            rest = rest.replace(new RegExp("([^\\\\])@" + symbol + "\\b", "g"), "$1" + text);
        }
        
        // Replace the text with the pre-processed text.
        this.text = declarations + rest;

        // While there's more text, parse a line.
        while(this.more()) {
            // Read a block
            var block = this.parseBlock(metadata);
            // Add it to the list if we parsed something.
            if(block !== null)
                blocks.push(block);            
            // Read whitespace until we find the next thing.
            while(this.peek() === " " || this.peek() === "\t" || this.peek() === "\n")
                this.read();
        }

        return new ChapterNode(blocks, metadata);

    }

    parseSymbols(metadata) {

        // Read whitespace before the symbols
        this.readWhitespace();

        // Keep reading symbols
        while(this.nextIs("@")) {

            // Read the @
            this.read();

            // Read the name.
            let name = this.readUntilNewlineOr(":");

            // Names need to be letter and numbers only.
            if(!/^[a-zA-Z0-9]+$/.test(name)) {
                this.readUntilNewLine();
                metadata.errors.push(new ErrorNode(
                    metadata,
                    name.trim() === "" ? 
                        "Did you mean to declare a symbol? Use an @ symbol, then a name of only numbers and letters, then a colon, then whatever content you want it to represent." :
                        "'" + name + "' isn't a valid name for a symbol; letters and numbers only"
                    ));
                return;
            }

            // Read any whitespace until the colon.
            this.readWhitespace();

            // Name declarations need to be terminated with a colon before the block starts.
            if(!this.nextIs(":")) {
                this.readUntilNewLine();
                metadata.errors.push(new ErrorNode(metadata, "Symbol names ave to be followed by a ':'"));
                return;
            }

            // Read the colon
            this.read();

            // Read any whitespace after the colon.
            this.readWhitespace();

            // Remember where the text starts
            let startIndex = this.index;

            // Parse a block, any block.
            this.parseBlock(metadata);

            // Remember the text we parsed.
            metadata.symbols[name] = this.text.substring(startIndex, this.index).trim();

            // Read whitespace until we find the next non-whitespace thing.
            while(this.peek() === " " || this.peek() === "\t" || this.peek() === "\n")
                this.read();
        
        }

    }

    parseBlock(metadata) {

        // Read whitespace before the block.
        this.readWhitespace();

        // Read the comment and return nothing.
        if(this.nextIs("%")) {
            this.readUntilNewLine();
            return null;
        }
        // Parse and return a header if it starts with a hash
        else if(this.nextIs("#"))
            return this.parseHeader(metadata);
        // Parse and return a horizontal rule if it starts with a dash
        else if(this.nextIs("-"))
            return this.parseRule(metadata);
        // Parse and return an embed if it starts with a bar
        else if(this.nextIs("|"))
            return this.parseEmbed(metadata);
        // Parse and return a bulleted list if it starts with a star and space
        else if(this.nextMatches(/^\*+\s+/))
            return this.parseBulletedList(metadata);
        // Parse and return a numbered list if it starts with a number
        else if(this.nextMatches(/^[0-9]+\.+/))
            return this.parseNumberedList(metadata);
        // Parse and return a code block if it starts with `, some optional letters, some whitespace, and a newline
        else if(this.nextMatches(/^`[a-zA-Z]*[ \t]*\n/))
            return this.parseCode(metadata);
        // Parse and return a quote block if it starts with "
        else if(this.nextMatches(/^"[ \t]*\n/))
            return this.parseQuote(metadata);
        // Parse and return a callout if the line starts with =
        else if(this.nextMatches(/^=[ \t]*\n/))
            return this.parseCallout(metadata);
        // Parse and return a table if the line starts with a ,
        else if(this.nextIs(","))
            return this.parseTable(metadata);
        // Parse the text as paragraph;
        else
            return this.parseParagraph(metadata);

    }

    parseParagraph(metadata) {

        return new ParagraphNode(this.parseContent(metadata));

    }

    parseHeader(metadata) {

        // Read a sequence of hashes
        var count = 0;
        while(this.nextIs("#")) {
            this.read();
            count++;
        }

        // Read any whitespace after the hashes.
        this.readWhitespace();

        // Parse some content.
        let content = this.parseContent(metadata);
        let node = new HeaderNode(Math.min(3, count), content);
        
        if(metadata)
            metadata.headers.push(node);

        // Return a header node.
        return node;

    }
    
    parseRule(metadata) {

        // Read until the end of the line. Ignore all text that follows.
        this.readUntilNewLine();

        return new RuleNode();

    }

    parseBulletedList(metadata) {

        var bullets = [];
        let lastLevel = undefined;
        let currentLevel = undefined;

        // Keep parsing bullets until there aren't any.
        while(this.nextMatches(/^\*+\s+/)) {

            // Remember the last level
            lastLevel = currentLevel;

            // Figure out this level.
            currentLevel = 0;
            while(this.nextIs("*")) {
                this.read();
                currentLevel++;
            }

            // If this is the first bullet, or its the same level, just parse content.
            if(lastLevel === undefined || lastLevel === currentLevel) {
                // Read the whitespace after the bullet.
                this.readWhitespace();
                // Parse content after the bullet.
                bullets.push(this.parseContent(metadata));
            }
            // Otherwise, unread the stars, then either stop parsing or parse nested list.
            else {

                // Unread the stars.
                let count = currentLevel;
                while(count > 0) {
                    this.unread();
                    count--;
                }

                // If this new bullet is a lower level, then stop reading bullets.
                if(currentLevel < lastLevel)
                    break;
                // Otherwise, it's greater, and we should read another list.
                else {
                    bullets.push(this.parseBulletedList(metadata));
                    // Reset the current level to the last level, so we expect another bullet at the same level.
                    currentLevel = lastLevel;
                }
            }

            // Read trailing whitespace after the content.
            this.readWhitespace();

            /// Keep reading newlines and content until we get to something that's neither.
            while(this.peek() === "\n") {
                // Read the newline
                this.read();
                // Read whitespace before the next block.
                this.readWhitespace();
            }

        }
        return new BulletedListNode(bullets);

    }

    parseNumberedList(metadata) {

        var bullets = [];
        let lastLevel = undefined;
        let currentLevel = undefined;

        // Keep parsing bullets until there aren't any.
        while(this.nextMatches(/^[0-9]+\.+/)) {

            // Read the digits and remember how many there were so we can backtrack.
            let digits = this.index;
            this.readUntilNewlineOr(".");
            digits = this.index - digits;

            // Remember the last level
            lastLevel = currentLevel;

            // Figure out this level.
            currentLevel = 0;
            while(this.nextIs(".")) {
                this.read();
                currentLevel++;
            }

            // If this is the first bullet, or its the same level, just parse another bullet.
            if(lastLevel === undefined || lastLevel === currentLevel) {
                // Read the whitespace after the bullet.
                this.readWhitespace();
                // Parse content after the bullet.
                bullets.push(this.parseContent(metadata));
            }
            // Otherwise, unread the stars, then either stop parsing or parse nested list.
            else {

                // Unread the periods.
                let count = currentLevel;
                while(count > 0) {
                    this.unread();
                    count--;
                }
                                
                // Unread the digits
                while(digits > 0) {
                    this.unread();
                    digits--;
                }

                // If this new bullet is a lower level, then stop reading bullets.
                if(currentLevel < lastLevel)
                    break;
                // Otherwise, it's greater, and we should read another list.
                else {
                    bullets.push(this.parseNumberedList(metadata));
                    // Reset the current level to the last level, so we expect another bullet at the same level.
                    currentLevel = lastLevel;
                }

            }

            // Read trailing whitespace and newlines.            
            this.readWhitespace();
            while(this.peek() === "\n") {
                // Read the newline
                this.read();
                // Read whitespace before the next block.
                this.readWhitespace();
            }

        }
        return new NumberedListNode(bullets);

    }

    parseCode(metadata) {

        // Parse the back tick
        this.read();

        // Parse through the next new line
        var language = this.readUntilNewLine();

        // Read the newline
        this.read();

        // Read until we encounter a closing back tick.
        var code = "";
        while(this.more() && !this.nextIs("`")) {
            var next = this.read(false);
            if(next === "\\") {
                if(this.nextIs("`")) {
                    this.read();
                    next = "`";
                }
            }
            code = code + next;
        }

        // Read the backtick.
        if(this.nextIs("`"))
            this.read();

        let position = "|";
        // Is there a position indicator?
        if(this.nextIs("<") || this.nextIs(">"))
            position = this.read();

        // Read the caption. Note that parsing inline content stops at a newline, 
        // so if there's a line break after the last row, there won't be a caption.
        var caption = this.parseContent(metadata);

        return new CodeNode(code, language, caption, position);

    }

    parseQuote(metadata) {

        var blocks = [];

        // Parse the ", then any whitespace, then the newline
        this.read();

        // Then read any whitespace after the quote
        this.readWhitespace();

        // Then read the newline.
        this.read();

        while(this.more() && !this.nextIs("\"")) {
            // Read a block
            var block = this.parseBlock(metadata);
            // Add it to the list if we parsed something.
            if(block !== null)
                blocks.push(block);
            // Read whitespace until we find the next thing.
            while(this.peek() === " " || this.peek() === "\t" || this.peek() === "\n")
                this.read();
        }

        // Read the closing " and the whitespace that follows.
        this.read();

        // Is there a position indicator?
        let position = "|";
        if(this.nextIs("<") || this.nextIs(">"))
            position = this.read();

        // Read any whitespace after the position indicator.
        this.readWhitespace();

        // Read the credit.
        var credit = this.nextIs("\n") ? null : this.parseContent(metadata);

        return new QuoteNode(blocks, credit, position);

    }

    parseCallout(metadata) {

        var blocks = [];

        // Parse the = ...
        this.read();

        // ...then any whitespace
        this.readWhitespace();

        // ...then read the newline.
        this.read();

        // Then, read until we find a closing _
        while(this.more() && !this.nextIs("=")) {
            // Read a block
            var block = this.parseBlock(metadata);
            // Add it to the list if we parsed something.
            if(block !== null)
                blocks.push(block);
            // Read whitespace until we find the next thing.
            while(this.peek() === " " || this.peek() === "\t" || this.peek() === "\n")
                this.read();
        }

        // Read the closing =
        this.read();

        // Is there a position indicator?
        let position = "|";
        if(this.nextIs("<") || this.nextIs(">"))
            position = this.read();
        
        // Read whitespace that follows.
        this.readWhitespace();

        return new CalloutNode(blocks, position);

    }

    parseTable(metadata) {

        var rows = [];

        // Parse rows until the lines stop starting with ,
        while(this.more() && this.nextIs(",")) {

            let row = [];

            while(this.more() && !this.nextIs("\n")) {

                // Read the starting , or next |
                this.read();

                // Read content until reaching another | or the end of the line.
                row.push(this.parseContent(metadata, "|"));

            }

            // Add the row.
            rows.push(row);

            // Read the newline
            this.read();

        }

        // Read the position indicator if there is one.
        let position = "|";
        if(this.nextIs("<") || this.nextIs(">"))
            position = this.read();

        // Read the caption. Note that parsing inline content stops at a newline, 
        // so if there's a line break after the last row, there won't be a caption.
        var caption = this.parseContent(metadata);

        return new TableNode(rows, caption, position);

    }

    // The "awaiting" argument keeps track of upstream formatting. We don't need a stack here
    // because we don't allow infinite nesting of the same formatting type.
    parseContent(metadata, awaiting) {

        var segments = [];

        // Read until hitting a delimiter.
        while(this.more() && !this.nextIs("\n")) {
            // Parse some formatted text
            if(this.nextIs("_") || this.nextIs("*"))
                segments.push(this.parseFormatted(metadata, this.peek()));
            // Parse unformatted text
            else if(this.nextIs("`")) {
                segments.push(this.parseInlineCode(metadata));
            }
            // Parse a citation list
            else if(this.nextIs("<"))
                segments.push(this.parseCitations(metadata));
            // Parse sub/super scripts
            else if(this.nextIs("^"))
                segments.push(this.parseSubSuperscripts(metadata));
            // Parse a footnote
            else if(this.nextIs("{"))
                segments.push(this.parseFootnote(metadata));
            // Parse a definition
            else if(this.nextIs("~"))
                segments.push(this.parseDefinition(metadata));
            // Parse an escaped character
            else if(this.nextIs("\\"))
                segments.push(this.parseEscaped(metadata));
            // Parse a link
            else if(this.nextIs("["))
               segments.push(this.parseLink(metadata));
            // Parse inline comments
            else if(this.charBeforeNext() === " " && this.nextIs("%"))
                this.parseComment(metadata);
            // Parse an unresolved symbol
            else if(this.nextIs("@")) {
                // Read the @, then the symbol name.
                this.read();
                let symbol = "";
                // Stop at the end of the name or file.
                while(this.more() && /[a-zA-Z0-9]/.test(this.peek()))
                    symbol = symbol + this.read();
                segments.push(new ErrorNode(metadata, "Couldn't find symbol @" + symbol));

            }
            // Keep reading text until finding a delimiter.
            else {
                let text = "";
                while(this.more() && (!awaiting || !this.nextIs(awaiting)) && !this.nextIsContentDelimiter() && !this.nextIs("\n"))
                    text = text + this.read();
                segments.push(new TextNode(text, this.index));
            }

            // If we've reached a delimiter we're waiting for, then stop parsing, so it can handle it. Otherwise, we'll keep reading.
            if(this.peek() === awaiting)
                break;

        }

        return new ContentNode(segments);

    }

    parseEmbed(metadata) {

        // Read |
        this.read();

        // Read the URL
        var url = this.readUntilNewlineOr("|");

        // Error if missing URL.
        if(url === "") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing URL in embed.");
        }

        if(this.peek() !== "|") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing '|' after URL in embed");
        }

        // Read a |
        this.read();

        // Read the description
        var description = this.readUntilNewlineOr("|");

        if(this.peek() !== "|") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing '|' after description in embed");
        }

        // Error if missing description.
        if(description === "") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing image/video description in embed.");
        }
        
        // Read a |
        this.read();
        // Parse the caption
        var caption = this.parseContent(metadata, "|");

        if(this.peek() !== "|") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing '|' after caption in embed");
        }
        
        // Read a |
        this.read();

        // Parse the credit
        var credit = this.parseContent(metadata, "|");

        // Error if missing credit.
        if(credit.toText().trim() === "") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing credit in embed.");
        }
        
        // Check for the closing delimeter
        if(this.peek() !== "|") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing '|' after credit in embed.");
        }

        // Read a |
        this.read();

        // Is there a position indicator?
        let position = "|";
        if(this.peek() === "<" || this.peek() === ">")
            position = this.read();

        return new EmbedNode(url, description, caption, credit, position);

    }

    parseComment(metadata) {

        // Consume the opening %
        this.read();

        // Consume everything until the next %.
        while(this.more() && this.peek() !== "\n" && this.peek() !== "%")
            this.read();

        // Consume the closing %, if we didn't reach the end of input or a newline.
        if(this.peek() === "%")
            this.read();

    }

    parseFormatted(metadata, awaiting) {

        // Remember what we're matching.
        var delimeter = this.read();
        var segments = [];
        var text = "";

        // Read some content until reaching the delimiter or the end of the line
        while(this.more() && this.peek() !== delimeter && !this.nextIs("\n")) {
            // If this is more formatted text, make a text node with whatever we've accumulated so far, 
            // then parse the formatted text, then reset the accumulator.
            if(this.nextIsContentDelimiter()) {
                // If the text is a non-empty string, make a text node with what we've accumulated.
                if(text !== "")
                    segments.push(new TextNode(text, this.index));
                // Parse the formatted content.
                segments.push(this.parseContent(metadata, awaiting));
                // Reset the accumulator.
                text = "";
            }
            // Add the next character to the accumulator.
            else {
                text = text + this.read();
            }
        }

        // If there's more text, save it!
        if(text !== "")
            segments.push(new TextNode(text, this.index));

        // Read the closing delimeter
        if(this.nextIs(delimeter))
            this.read();
        // If it wasn't closed, add an error
        else
            segments.push(new ErrorNode(metadata, "Unclosed " + delimeter));
        
        return new FormattedNode(delimeter, segments);

    }

    parseInlineCode(metadata) {

        // Parse the back tick
        this.read();

        // Read until we encounter a closing back tick.
        var code = "";
        while(this.more() && !this.nextIs("`")) {
            var next = this.read(false);
            if(next === "\\") {
                if(this.nextIs("`")) {
                    this.read();
                    next = "`";
                }
            }
            code = code + next;
        }

        // Read the backtick.
        if(this.nextIs("`"))
            this.read();

        // If there's a letter immediately after a backtick, it's a language for an inline code name
        let language = "";
        if(/^[a-z]$/.test(this.peek())) {
            do {
                language = language + this.read();
            } while(/^[a-z]$/.test(this.peek()));
        } else
            language = "plaintext"

        return new InlineCodeNode(code, language);
        
    }

    parseCitations(metadata) {
        
        var citations = "";

        // Read the <
        this.read();
        // Read the citations.
        var citations = this.readUntilNewlineOr(">");
        if(this.peek() === ">")
            this.read();

        // Trim any whitespace, then split by commas.
        citations = _map(citations.trim().split(","), citation => citation.trim());

        // We won't necessarily be gathering this data.
        // This does mean that if someone cites something in a non-chapter
        // it will silently fail.
        if(metadata)
            // Record each citation for later.
            _each(citations, citation => {
                metadata.citations[citation] = true;
            });

        return new CitationsNode(citations);

    }

    parseSubSuperscripts(metadata, awaiting) {
        
        // Read the ^
        this.read();

        // Default to superscript.
        let superscript = true;

        // Is there a 'v', indicating subscript?
        if(this.peek() === "v") {
            this.read();
            superscript = false;
        }

        // Parse the content
        let content = this.parseContent(metadata, "^");

        // Read the closing ^
        this.read();

        return new SubSuperscriptNode(superscript, content);

    }

    parseFootnote(metadata) {
        
        // Read the {
        this.read();

        // Read the footnote content.
        var footnote = this.parseContent(metadata, "}");

        // Read the closing }
        this.read();

        let node = new FootnoteNode(footnote);

        // TODO We won't necessarily be gathering this data.
        // This does mean that if someone cites something in a non-chapter
        // it will silently fail.
        if(metadata)
            metadata.footnotes.push(node);

        return node;

    }

    parseDefinition(metadata) {
        
        // Read the ~
        this.read();

        // Read the footnote content.
        var text = this.parseContent(metadata, "~");

        // Read the closing ~
        this.read();

        // Read the glossary entry ID
        let glossaryID = "";
        // Stop at the end of the name or file.
        while(this.more() && /[a-zA-Z]/.test(this.peek()))
            glossaryID = glossaryID + this.read();

        let node = new DefinitionNode(text, glossaryID);

        return node;

    }

    parseEscaped(metadata) {

        // Skip the scape and just add the next character.
        this.read();
        return new TextNode(this.read(), this.index);

    }
    
    parseLink(metadata) {
 
        // Read the [
        this.read();
        // Read some content, awaiting |
        var content = this.parseContent(metadata, "|");

        // Catch links with no label.
        if(content.segments.length === 0)
            return new ErrorNode(metadata, "Unclosed link");

        // Catch missing bars
        if(this.peek() !== "|") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing '|' in link");
        }

        // Read the |
        this.read();
        // Read the link
        var link = this.readUntilNewlineOr("]");

        // Catch missing closing
        if(this.peek() !== "]") {
            this.readUntilNewLine();
            return new ErrorNode(metadata, "Missing ] in link");
        }

        // Read the ]
        this.read();

        return new LinkNode(content, link);

    }

}

class Node {
    constructor() {}
}

class ChapterNode extends Node {
    constructor(blocks, metadata) {
        super();

        // The AST of the chapter.
        this.blocks = blocks;

        // Content extracted during parsing.
        this.metadata = metadata;

    }

    getErrors() {
        return this.metadata.errors;
    }

    getCitations() { 
        return this.metadata.citations; 
    }

    getFootnotes() { 
        return this.metadata.footnotes; 
    }

    getHeaders() {
        return this.metadata.headers; 
    }

    getCitationNumber(citationID) { 
        
        var index = Object.keys(this.getCitations()).sort().indexOf(citationID);

        if(index < 0)
            return null;
        else
            return index + 1;
    
    }

    toDOM(app, query) {
        return <div key="chapter" className="chapter-body">
            {
                this.metadata.errors.length === 0 ? 
                    null : 
                    <p><span className="alert alert-danger">{this.metadata.errors.length + " " + (this.metadata.errors.length > 1 ? "errors" : "error")} below</span></p>}
            {_map(this.blocks, (block, index) => block.toDOM(app, this, query, "block-" + index))}
        </div>;
    }

    toText() {
        return _map(this.blocks, block => block.toText()).join(" ");
    }

}

class ParagraphNode extends Node {

    constructor(content) {
        super();
        this.content = content;
    }
    toDOM(app, chapter, query, key) {
        return <p key={key}>{this.content.toDOM(app, chapter, query)}</p>;
    }

    toText() {
        return this.content.toText();
    }

}

class EmbedNode extends Node {
    constructor(url, description, caption, credit, position) {
        super();
        this.url = url;
        this.description = description;
        this.caption = caption;
        this.credit = credit;
        this.position = position;
    }

    toDOM(app, chapter, query, key) {
        return <Figure key={key}
            url={this.url}
            alt={this.description}
            caption={this.caption.toDOM(app, chapter, query)}
            credit={this.credit.toDOM(app, chapter, query)}
            position={this.position}
        />
    }

    toText() {
        return this.caption.toText();
    }

    toJSON() {
        return {
            url: this.url,
            alt: this.description,
            caption: this.caption.toText(),
            credit: this.credit.toText()
        };   
    }

}

class HeaderNode extends Node {
    constructor(level, content) {
        super();
        this.level = level;
        this.content = content;
    }

    toDOM(app, chapter, query, key) {
        let id = "header-" + chapter.getHeaders().indexOf(this);

        return this.level === 1 ? <h2 className="header" id={id} key={key}>{this.content.toDOM(app, chapter, query)}</h2> :
            this.level === 2 ? <h3 className="header" id={id} key={key}>{this.content.toDOM(app, chapter, query)}</h3> :
            <h4 className="header" id={id} key={key}>{this.content.toDOM(app, chapter, query)}</h4>
    }

    toText() {
        return this.content.toText();
    }

}

class RuleNode extends Node {
    constructor() {
        super();
    }

    toDOM(app, chapter, query, key) { return <hr key={key} />; }

    toText() {
        return "";
    }

}

class BulletedListNode extends Node {
    constructor(items) {
        super();
        this.items = items;
    }

    toDOM(app, chapter, query, key) {
        return <ul key={key}>{
            _map(this.items, (item, index) =>
                item instanceof BulletedListNode ?
                    item.toDOM(app, chapter, query, "item-" + index) :
                    <li key={"item-" + index}>{item.toDOM(app, chapter, query)}</li>
            )}
        </ul>;
    }

    toText() {
        return _map(this.items, item => item.toText()).join(" ");
    }

}

class NumberedListNode extends Node {
    constructor(items) {
        super();
        this.items = items;
    }

    toDOM(app, chapter, query, key) {
        return <ol key={key}>{
            _map(this.items, (item, index) =>
                item instanceof NumberedListNode ?
                    item.toDOM(app, chapter, query, "item-" + index) :
                    <li key={"item-" + index}>{item.toDOM(app, chapter, query)}</li>
            )}
        </ol>;
    }

    toText() {
        return _map(this.items, item => item.toText()).join(" ");
    }

}

class CodeNode extends Node {
    constructor(code, language, caption, position) {
        super();
        this.code = code;
        this.language = language ? language : "plaintext";
        this.caption = caption;
        this.position = position;
    }
    toDOM(app, chapter, query, key) {
        return <div key={key} className={(this.position === "<" ? "marginal-left-inset" : this.position === ">" ? "marginal-right-inset" : "")}>
            <Code inline={false} language={this.language}>{this.code}</Code>
            { this.language !== "plaintext" ? <div className="code-language">{this.language}</div> : null }
            <div className="figure-caption">{this.caption.toDOM(app, chapter, query)}</div>
        </div>
    }

    toText() {
        return "";
    }

}

class QuoteNode extends Node {

    constructor(elements, credit, position) {
        super();
        this.elements = elements;
        this.credit = credit;
        this.position = position;
    }

    toDOM(app, chapter, query, key) {

        return <blockquote className={"blockquote " + (this.position === "<" ? "marginal-left-inset" : this.position === ">" ? "marginal-right-inset" : "")} key={key}>
            {_map(this.elements, (element, index) => element.toDOM(app, chapter, query, "quote-" + index))}
            {this.credit ? <div className="blockquote-caption"><span>{this.credit.toDOM(app, chapter, query)}</span></div> : null }
        </blockquote>

    }

    toText() {
        return _map(this.elements, element => element.toText()).join(" ") + (this.credit ? " " + this.credit.toText() : "");
    }

}

class CalloutNode extends Node {

    constructor(elements, position) {
        super();
        this.elements = elements;
        this.position = position;
    }

    toDOM(app, chapter, query, key) {

        return <div className={"callout " + (this.position === "<" ? "marginal-left-inset" : this.position === ">" ? "marginal-right-inset" : "")} key={key}>
            {_map(this.elements, (element, index) => element.toDOM(app, chapter, query, "callout-" + index))}
        </div>

    }

    toText() {
        return _map(this.elements, element => element.toText()).join(" ");
    }

}

class TableNode extends Node {

    constructor(rows, caption, position) {
        super();
        this.rows = rows;
        this.caption = caption;
        this.position = position;
    }

    toDOM(app, chapter, query, key) {

        // Determine the maximum number of columns so we can set the right colspan if necessary.
        let maxColumns = this.rows.reduce((max, row) => Math.max(row.length, max), 0);

        return (
            <div className={"figure " + (this.position === "<" ? "marginal-left-inset" : this.position === ">" ? "marginal-right-inset" : "")} key={key}>
                {/* Make the table responsive for small screens */}
                <div className="rows table-responsive">
                    <table className="table">
                        <tbody>
                        {
                            _map(this.rows, (row, index) => 
                                <tr key={"row-" + index}>
                                    {
                                        row.length === 1 ?
                                            [<td key={"cell-" + index} colSpan={maxColumns}>{row[0].toDOM(app, chapter, query, "cell-" + index)}</td>] :
                                            _map(row, (cell, index) => <td key={"cell-" + index}>{cell.toDOM(app, chapter, query, "cell-" + index)}</td>)
                                    }
                                </tr>
                            )
                        }
                        </tbody>
                    </table>

                </div>
                <div className="figure-caption">{this.caption.toDOM(app, chapter, query)}</div>
            </div>
        );
    }

    toText() {
        return _map(this.rows, row => _map(row, cell => cell.toText()).join(", ")).join(", ");
    }

}

class FormattedNode extends Node {

    constructor(format, segments, language) {
        super();
        this.format = format;
        this.segments = segments;
        this.language = language;
    }

    toDOM(app, chapter, query, key) {
        
        var segmentDOMs = _map(this.segments, (segment, index) => segment.toDOM(app, chapter, query, "formatted-" + index));

        if(this.format === "*")
            return <strong key={key}>{segmentDOMs}</strong>;
        else if(this.format === "_")
            return <em key={key}>{segmentDOMs}</em>;
        else if(this.format === "`")
            return <Code key={key} inline={true} language={this.language}>{segmentDOMs}</Code>;
        else
            return <span key={key}>{segmentDOMs}</span>;
        
    }

    toText() {
        return _map(this.segments, segment => segment.toText()).join(" ");
    }

}

class InlineCodeNode extends Node {

    constructor(code, language) {
        super();
        this.code = code;
        this.language = language;
    }

    toDOM(app, chapter, query, key) {
        return <Code key={key} inline={true} language={this.language}>{this.code}</Code>;        
    }

    toText() {
        return this.code;
    }

}

class LinkNode extends Node {
    constructor(content, url) {
        super();
        this.content = content;
        this.url = url;
    }
    toDOM(app, chapter, query, key) {
        return this.url.startsWith("http") ?
            // If this is external link, make an anchor that opens a new window.
            <a  key={key} href={this.url} target="_blank">{this.content.toDOM(app, chapter, query)}</a> :
            // If this is internal link, make a route link. TODO What if the chapter doesn't exist?
            <Link key={key} to={this.url}>{this.content.toDOM(app, chapter, query)}</Link>;
    }

    toText() {
        return this.content.toText();
    }

}

class CitationsNode extends Node {
    constructor(citations) {
        super();
        this.citations = citations;
    }
    toDOM(app, chapter, query, key) {

        let segments = [];

        // If there's no chapter, there are no citations allowed.
        if(!chapter)
            return null;

        // Sort citations numerically, however they're numbered.
        let citations = this.citations.sort((a, b) => {
            let aNumber = chapter.getCitationNumber(a);
            let bNumber = chapter.getCitationNumber(b);
            if(aNumber === null && bNumber === null) return 0;
            else if(aNumber === null && bNumber !== null) return 1;
            else if(aNumber !== null && bNumber === null) return -1;
            else return aNumber - bNumber;
        });

        // Convert each citation ID until a link.
        _each(
            citations,
            (citationID, index) => {
                // Find the citation number. There should always be one,
                let citationNumber = chapter.getCitationNumber(citationID)
                if(citationNumber !== null && citationID in app.getReferences()) {
                    // Add a citation.
                    segments.push(
                            <sup key={index} className="citation-symbol">{citationNumber}</sup>
                    );
                }
                // If it's not a valid citation number, add an error.
                else {
                    segments.push(<span className="alert alert-danger" key={"citation-error-" + index}>Unknown reference: <code>{citationID}</code></span>)
                }

                // If there's more than one citation and this isn't the last, add a comma.
                if(citations.length > 1 && index < citations.length - 1)
                    segments.push(<sup key={"citation-comma-" + index}>,</sup>);
            }
        );

        return <span className="citation" key={key}>
            <Marginal
                app={app}
                id={"citation-" + citations.join("-")}
                interactor={segments}
                content={
                    <span className="references">
                        {_map(citations, (citationID, index) => {

                            let citationNumber = chapter.getCitationNumber(citationID);

                            return app.getReferences(citationID) ?
                                <span 
                                    key={index} 
                                    className="reference">
                                        <sup className="citation-symbol">{citationNumber}</sup>
                                        {Parser.parseReference(app.getReferences()[citationID], app, true)}
                                </span> :
                                null
                    })}
                    </span>
                }
            />
        </span>

    }

    toText() {
        return "";
    }

}

class DefinitionNode extends Node {
    constructor(phrase, glossaryID) {
        super();
        this.phrase = phrase;
        this.glossaryID = glossaryID;
    }

    toDOM(app, chapter, query, key) {

        // Find the definition.
        let glossary = app.getGlossary();

        if(!(this.glossaryID in glossary))
            return <span key={key} className="alert alert-danger">Unknown glossary entry "{this.glossaryID}"</span>

        let entry = glossary[this.glossaryID];

        return <span className="terminology" key={key}>
            <Marginal
                app={app}
                id={"glossary-" + this.glossaryID}
                interactor={this.phrase.toDOM(app, chapter, query)}
                content={
                    <span className="definition">
                        <strong>{entry.phrase}</strong>: {entry.definition}
                        {
                            entry.synonyms.length > 0 ? <span><br/><br/><em>{entry.synonyms.join(", ")}</em></span> : null
                        }
                    </span>
                }
            />
        </span>

    }

    toText() {
        return this.phrase.toText();
    }

}

class FootnoteNode extends Node {
    constructor(footnote) {
        super();
        this.footnote = footnote;
    }
    toDOM(app, chapter, query, key) {

        // If no chapter was provided, then don't render the footnote, since there's no context in which to render it.
        if(!chapter)
            return null;

        // What footnote number is this?
        let number = chapter.getFootnotes().indexOf(this);
        let letter = app.getFootnoteSymbol(number);

        return <span className="footnote-link" key={key}>
            <Marginal 
                app={app}
                id={"footnote-" + number}
                interactor={<sup className="footnote-symbol">{letter}</sup>}
                content={<span className="footnote"><sup className="footnote-symbol">{letter}</sup> {this.footnote.toDOM(app, chapter, query)}</span>} 
            />
        </span>

    }

    toText() {
        return this.footnote.toText();
    }

}

class ContentNode extends Node {
    constructor(segments) {
        super();
        this.segments = segments;
    }

    toDOM(app, chapter, query, key) {
        return <span key={key}>{_map(this.segments, (segment, index) => segment.toDOM(app, chapter, query, "content-" + index))}</span>;
    }

    toText() {
        return _map(this.segments, segment => segment.toText()).join(" ");
    }
}

class SubSuperscriptNode extends Node {
    constructor(superscript, content) {
        super();
        this.superscript = superscript;
        this.content = content;
    }

    toDOM(app, chapter, query, key) {
        return this.superscript?
            <sup key={key}>{this.content.toDOM(app, chapter, query, "sup-")}</sup> :
            <sub key={key}>{this.content.toDOM(app, chapter, query, "sub-")}</sub>;
    }

    toText() {
        return this.content.toText();
    }
}

class TextNode extends Node {
    constructor(text, position) {
        super();
        this.text = text;
        this.position = position - text.length;
    }

    toDOM(app, chapter, query, key) {
        
        // Is there a query we're supposed to highlight? If so, highlight it.
        if(query) {
            var text = this.text;
            var lowerText = text.toLowerCase();
            // Does this text contain the query? Highlight it.
            if(lowerText.indexOf(query) >= 0) {

                // Find all the matches
                var indices = [];
                for(var i = 0; i < text.length; ++i) {
                    if (lowerText.substring(i, i + query.length) === query) {
                        indices.push(i);
                    }
                }

                // Go through each one and construct contents for the span to return.
                var segments = [];
                for(var i = 0; i < indices.length; i++) {
                    // Push the text from the end of the last match or the start of the string.
                    segments.push(text.substring(i === 0 ? 0 : indices[i - 1] + query.length, indices[i]));
                    segments.push(<span key={"match-" + i} className="content-highlight">{text.substring(indices[i], indices[i] + query.length)}</span>);
                }
                if(indices[indices.length - 1] < text.length - 1)
                    segments.push(text.substring(indices[indices.length - 1] + query.length, text.length));

                return <span key={key}>{segments}</span>;

            }
            else return this.text;

        } 
        // Otherwise, just return the text.
        else return <span key={key} className="text" data-position={this.position}>{this.text}</span>;

    }

    toText() {
        return this.text;
    }

}

class ErrorNode extends Node {
    constructor(metadata, error) {
        super();
        this.error = error;

        // Add the error to the give metadata object.
        metadata.errors.push(this);
    }

    toDOM(app, chapter, query, key) {
        return <span key={key} className="alert alert-danger">Error: {this.error}</span>;
    }

    toText() {
        return "";
    }

}

export {Parser};