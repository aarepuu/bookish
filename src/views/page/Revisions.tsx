import React, { useContext } from "react"
import Book from "../../models/Book"
import Parser from "../../models/Parser"
import { renderNode } from "../chapter/Renderer"
import { EditorContext } from "./Book"

const Revisions = (props: { book: Book }) => {

	const { editable } = useContext(EditorContext)
	const book = props.book

	return <>
		{
			book.getRevisions().length === 0 ? 
				null :
				<>
					<h2 className="bookish-header" id="revisions">Revisions</h2>
					<ul>
						{book.getRevisions().map((revision, index) => {
							return <li key={"revision" + index}><em>{revision[0]}</em>. { renderNode(Parser.parseContent(book, revision[1])) }</li>;
						})}
					</ul>
				</>	
		}
	</>

}

export default Revisions