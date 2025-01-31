import React, { useContext, useEffect } from 'react'
import { ChapterContext } from './Chapter'
import Marginal  from './Marginal'
import { renderNode } from './Renderer'
import { FootnoteNode } from "../../models/FootnoteNode"
import Atom from '../editor/Atom'

const Footnote = (props: { node: FootnoteNode }) => {

    const { node } = props
    const footnote = node.getMeta();
    const context = useContext(ChapterContext);

    // If no chapter was provided, then don't render the footnote, since there's no context in which to render it.
    if(!context || !context.chapter || !context.book)
        return <></>;

    // What footnote number is this?
    let number = context.chapter.getFootnotes().indexOf(node);
    let letter = context.book.getFootnoteSymbol(number);

    // Position the marginals on every render.
    useEffect(() => {
        if(context && context.layoutMarginals) {
            context.layoutMarginals();
        }
    });
    
    return <Atom
        node={node}
        textView={
            <span className={`bookish-footnote-link`} data-nodeid={props.node.nodeID}>
                <Marginal 
                    id={"footnote-" + number}
                    interactor={<sup className="bookish-footnote-symbol">{letter}</sup>}
                    content={<span className="bookish-footnote"><sup className="bookish-footnote-symbol">{letter}</sup> {renderNode(footnote)}</span>} 
                />
            </span>
        }
    />

}

export default Footnote