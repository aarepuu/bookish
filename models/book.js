import Ajv from 'ajv';

import { Chapter } from './chapter.js';

let schema = require("./schema.json");

class Book {

    // Given a URL of a book.json object, downloads it and all of it's chapters.
    constructor(url, progressHandler) {

        // A string that points to a book specification file.
        this.url = url;

        // A list of strings indicating schema violations.
        this.errors = [];

        // If undefined, it's not loaded; if null, it failed to load; otherwise, an object with a book specification.
        this.specification = undefined;

        // This function is called when some loading progress happens.
        this.progressHandler = progressHandler;

        // A dictionary of Chapter objects.
        this.chapters = {};

        // Keep track of loading status.
        this.loadedSpecification = false;
        this.chaptersLoaded = 0;

        // Lookup table for optimization
		this.chapterNumbers = {};

        // Load the book.
        this.loadSpecification();

    }

    isSpecificationLoaded() { return this.loadedSpecification; }
    getErrors() { return this.errors; }

    // Loads the book specification.
    loadSpecification() {        

        // Fetch the JSON
        fetch(this.url)
            .then(response => {

                // If it's a valid status, parse the text as JSON.
                if (response.status >= 200 && response.status <= 299) {
                    return response.json();
                } 
                // Otherwise, return an error.
                else {
                    throw Error(response.statusText);
                }

            })
            .then(data => {

                this.loadedSpecification = true;

                // Validate the book schema before we get started.
                let ajv = new Ajv();
                let valid = ajv.validate(schema, data);

                // Did the specification have schema errors?
                // Initialize the book as null and set the errors.
                if (!valid) {
                    this.specification = null;
                    this.errors = ajv.errors.map(error => this.url + error.dataPath + " " + error.message);
                } 
                // If it is valid, then set the specification and load the chapters.
                else {
                    this.specification = data;
                    this.loadChapters();
                }
                // Notify the progress handler.
                this.progressHandler.call();

            })
            // If there was an error, print it to the console and set the errors.
            .catch(err => {

                this.loadedSpecification = true;

                console.error(err);
                // Uh oh, something bad happened. Set data to null to render an error.
                this.specification = null;
                this.errors = ["Wasn't able to load the file " + this.url + ": " + err.message];

                // Notify the progress handler.
                this.progressHandler.call();

            });
 
    }

    // Fetch each chapter using it's ID, process the text if we get it, and notify the progress handler.
	loadChapters() {

        if(this.getSpecification() === undefined)
            throw "Specification isn't done loading, can't fetch chapters.";
        else if(this.getSpecification() === null)
            throw "Specification failed to load, can't fetch chapters";

		// Request all of the chapter content...
		this.getChapters().forEach(chapter => {

            // Create a chapter with no text by default.
            this.setChapter(chapter, null);

            // Try to load the chapter.
			fetch("chapters/" + chapter.id + ".md")
				.then((response) => {
                    // Remember that we got a response.
                    this.chaptersLoaded++;

					// If we got a reasonable response, process the chapter.
					if(response.ok)
						response.text().then(text => this.setChapter(chapter, text));
                    
				})
        });

	}

    setChapter(chapter, text) {

        // Create a chapter and add it to our dictionary of chapters.
        this.chapters[chapter.id] = new Chapter(
            this,
            chapter.id, 
            chapter.title, 
            chapter.authors, 
            chapter.image, 
            "numbered" in chapter ? chapter.numbered : false, 
            "section" in chapter ? chapter.section : null,
            text
        );

        // Notify the progress handler about the processed. chapter.
        this.progressHandler.call();

    }

    getSpecification() { return this.specification; }
    
    getTitle() { return this.getSpecification().title; }
    
    getChapters() { 
        if(this.specification === null) throw "The specification failed to load, can't get chapters.";
        else if(this.specification === undefined) throw "The specification hasn't loaded yet, can't get chapters";
        else return this.specification.chapters; 
    }

    hasChapter(chapterID) { return chapterID in this.chapters; }
    getChapter(chapterID) { return this.hasChapter(chapterID) ? this.chapters[chapterID] : null; }
    getSymbols() { return this.specification ? this.specification.symbols : {}; }
	getLicense() { return this.getSpecification().license; }
	getCover() { return this.getSpecification().cover; }
	getUnknown() { return this.getSpecification().unknown; }
	getReferences() { return this.getSpecification().references; }
	getGlossary() { return this.getSpecification().glossary; }
	getTags() { return "tags" in this.getSpecification() ? this.getSpecification().tags : []; }
	getAuthors() { return this.getSpecification().authors; }	
	getAuthorByID(id) { return this.getAuthors().find(el => el.id === id); }
	getDescription() { return this.getSpecification().description; }
	getRevisions() { return this.getSpecification().revisions; }
	
	getChapterReadingTime(chapterID) { 
		return this.chapterIsLoaded(chapterID) ? 
			Math.max(1, Math.round(this.getChapter(chapterID).getWordCount() / 150)) : 
			undefined;
	}
	
	getBookReadingTime() {
		return Object.keys(this.chapters)
                .map(chapterID => this.getChapterReadingTime(chapterID))
                .reduce((total, time) => time === undefined ? total : total + time, 0);
	}

	getChapterNumber(chapterID) {

        // If we haven't loaded or failed to load, this is undefined.
        if(!this.specification)
            return undefined;

		// If we haven't cached it yet, compute it.
		if(!(chapterID in this.chapterNumbers)) {
			let chapterNumber = 1;
			let match = null;
			this.getChapters().forEach(chapter => {
				// If we found a match...
				if(chapter.id === chapterID) {
					match = chapterNumber;
					// And it's an unnumbered chapter, set to null.
					if("numbered" in chapter && chapter.numbered === false)
                        match = null;
				} 
				// Otherwise, increment if it's numbered.
				else if(!("numbered" in chapter) || chapter.numbered === true)
					chapterNumber++;
			});
			// Remember the number if we found it.
            if(match !== null) {
    			this.chapterNumbers[chapterID] = match;
                return match;
            }
            else return undefined;
            
		}
        else 
            // Return it.
            return this.chapterNumbers[chapterID];

	}

	getSource(sourceID) { 
		return sourceID.charAt(0) === "#" && sourceID.substring(1) in this.specification.sources ? 
            this.specification.sources[sourceID.substring(1)] : 
            null;
	}

	getChapterName(chapterID) { return this.hasChapter(chapterID) ? this.getChapter(chapterID).getTitle() : null; }

    getChapterSection(chapterID) { return this.hasChapter(chapterID) ? this.chapters[chapterID].getSection() : null; }
	
    chapterIsLoaded(chapterID) { return this.hasChapter(chapterID) ? this.chapters[chapterID].getText() !== null : false; }
	
    chaptersAreLoaded() { return Object.keys(this.getSpecification().chapters).length === this.chaptersLoaded; }

	getFootnoteSymbol(number) {

		let symbols = "abcdefghijklmnopqrstuvwxyz";
        // Let's hope there are never more than 26^2 footnotes in a single chapter...
        return number < symbols.length ?
            symbols.charAt(number) :
            symbols.charAt(Math.floor(number / symbols.length) - 1) + symbols.charAt(number % symbols.length);

	}

    getBookIndex() {

		var bookIndex = {};

		// Construct the index by building a dictionary of chapters in which each word appears.
		Object.values(this.chapters).forEach(chapter => {
            let index = chapter.getIndex();
            if(index)
			    Object.keys(index).forEach(word => {
                    if(word !== "" && word.length > 2) {
                        if(!(word in bookIndex))
                            bookIndex[word] = {};
                        bookIndex[word][chapter.id] = true;
                    }
                });
		});

		// Convert each word's dictionary to a list of chapter IDs for display.
		Object.keys(bookIndex).forEach(word => {
			bookIndex[word] = Object.keys(bookIndex[word]);
		});

		return this.cleanIndex(bookIndex);

	}

    cleanIndex(index) {

		// Remove any:
		// * upper case versions of words if they appear in lower case,
		// * plural versions of words if they appear in singular
		// as a heuristic for detecting non-proper nounds.
		var duplicates = [];
		Object.keys(index).forEach(word => {
			var duplicate = false;
			var canonical = null;
			if((word.charAt(0) === word.charAt(0).toUpperCase() && word.toLowerCase() in index)) {
				duplicate = true;
				canonical = word.toLowerCase();
			}
			if(word.charAt(word.length - 1) === "s" && word.toLowerCase().substring(0, word.length - 1) in index) {
				duplicate = true;
				canonical = word.toLowerCase().substring(0, word.length - 1);
			}
			if(duplicate) {				
				duplicates.push(word);
				// Merge any chapter occurrences, removing duplicates using a set and spread.
				if(Array.isArray(index[canonical]))
					index[canonical] = [...new Set(index[canonical].concat(index[word]))];
			}
		})
		duplicates.forEach(word => {
			delete index[word];
		});

		return index;

	}

	// Given the current chapter, find the available chapter after it.
	getNextChapterID(chapterID) {

		let chapters = this.getChapters();
		let after = false;
		for(let i = 0; i < chapters.length; i++) {
			if(chapters[i].id === chapterID)
				after = true;
			else if(after && this.chapterIsLoaded(chapters[i].id))
				return chapters[i].id;
		}
		return null;

	}

	// Given a chapter id, find the available chapter before it.
	getPreviousChapterID(chapterID) {

		let chapters = this.getChapters();
		let before = false;
		for(let i = chapters.length - 1; i >= 0; i--) {
			if(chapters[i].id === chapterID)
				before = true;
			else if(before && this.chapterIsLoaded(chapters[i].id))
				return chapters[i].id;
		}
		return null;

	}

}

export { Book };