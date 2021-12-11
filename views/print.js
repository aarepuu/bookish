import React from 'react'
import { TableOfContents } from "./toc"
import { Chapter } from "./chapter"

class Print extends React.Component {

	render() {

        if(!this.props.app.getBook())
            return <>Loading...</>

        return <>
            {
                // Render all of the chapters
                this.props.app.getBook().getChapters().map(
                    (chapter, index) => <Chapter key={index} id={chapter.id} app={this.props.app} print />
                )
            }
        </>
    }

}

export { Print }