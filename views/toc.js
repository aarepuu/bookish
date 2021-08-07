import _map from 'lodash/map';
import React from 'react';
import { Link } from 'react-router-dom';
import { Header } from "./header";
import { Authors } from "./authors";
import { Parser } from "../parser";

class TableOfContents extends React.Component {

	constructor(props) {

		super(props);

	}

	// Always start at the top of the page.
	componentDidMount() {
		window.scrollTo(0, 0)
	}

	getProgressDescription(progress) {

		if(progress === null)
			return "";
		else if(progress === 0)
			return "";
		else if(progress < 30)
			return "; just started";
		else if(progress < 70)
			return "; halfway";
		else if(progress < 95)
			return "; almost done";
		else
			return "; done";

	}

	render() {

		// Get the chapter progress
		var progress = localStorage.getItem("chapterProgress");
		if(progress === null) {
			progress = {};
		} else {
			progress = JSON.parse(progress);
		}

		var readingTime = this.props.app.getBookReadingTime();

		// Is there a colon? Let's make a subtitle
		let title = this.props.app.getTitle();
		let subtitle = null;
		let colon = title.indexOf(":");
		if(colon >= 0) {
			subtitle = title.substr(colon + 1);
			title = title.substr(0, colon);
		}

		return (
			<div className="toc">

				<Header 
					image={this.props.app.getCover()} 
					header={title}
					subtitle={subtitle}
					tags={this.props.app.getTags()}
					content={<Authors authors={this.props.app.getAuthors()} />}
				/>

				{Parser.parseChapter(this.props.app, this.props.app.getDescription()).toDOM()}

				<h2>Chapters <small><small className="text-muted"><em>{readingTime < 60 ? Math.max(5, (Math.floor(readingTime / 10) * 10)) + " min read" : "~" + Math.round(readingTime / 60.0) + " hour read" }</em></small></small></h2>

				<table className="table" id="toc">
					<tbody>
						{
							_map(this.props.app.getChapters(), (chapter, index) => {

								// Get the image, chapter number, and section for rendering.
								let image = Parser.parseEmbed(this.props.app, chapter.image).toJSON();
								let chapterNumber = this.props.app.getChapterNumber(chapter.id);
								let section = this.props.app.getChapterSection(chapter.id);

								let readingTime = this.props.app.getChapterReadingTime(chapter.id);
								let readingEstimate =
									readingTime === undefined ? "Forthcoming" :
									readingTime < 5 ? "<5 min read" :
									readingTime < 60 ? "~" + Math.floor(readingTime / 5) * 5 + " min read" :
									"~" + Math.round(10 * readingTime / 60) / 10 + " hour read";

								return (
									<tr key={"chapter" + index}>
										<td>
											<img 
												className="img-rounded" 
												style={{width: "5em"}} 
												src={image.url.startsWith("http") ? image.url : "images/" + image.url}
												alt={chapter.alt}
											/>
										</td>
										<td>
											<div>
												{ chapterNumber === null ? null : <div className="chapter-number">{"Chapter " + chapterNumber}</div> }
												<div>
													{
														this.props.app.chapterIsLoaded(chapter.id) ? 
															<Link to={"/" + chapter.id}>{chapter.title}</Link> :
															<span>{chapter.title}</span>
													}
												</div>
												{ section === null ? null : <div className="section-name">{section}</div> }
											</div>
										</td>
										<td>
											<small className="text-muted">
												<em>
													{ readingEstimate }
													{ this.getProgressDescription(chapter.id in progress ? progress[chapter.id] : null) }
												</em>
											</small>
											{
												chapter.ast && chapter.ast.getErrors().length > 0 ? 
													<span><br/><small className="alert alert-danger">{chapter.ast.getErrors().length + " " + (chapter.ast.getErrors().length > 1 ? "errors" : "error")}</small></span> :
													null
											}
										</td>
									</tr>
								)
							})
						}
						{
							this.props.app.getReferences() === null ? null :
							<tr key="references">
								<td></td>
								<td><Link to="/references">References</Link><br/><small className="text-muted"><em>Everything cited</em></small></td>
								<td></td>
							</tr>
						}
						{
							this.props.app.getGlossary() && Object.keys(this.props.app.getGlossary()).length > 0 ?
							<tr key="glossary">
								<td></td>
								<td><Link to="/glossary">Glossary</Link><br/><small className="text-muted"><em>Definitions</em></small></td>
								<td></td>
							</tr> : null
						}
						<tr key="index">
							<td></td>
							<td><Link to="/index/a">Index</Link><br/><small className="text-muted"><em>Common words and where they are</em></small></td>
							<td></td>
						</tr>
						<tr key="search">
							<td></td>
							<td><Link to="/search">Search</Link><br/><small className="text-muted"><em>Find where words occur</em></small></td>
							<td></td>
						</tr>
					</tbody>
				</table>

				<h2>License</h2>

				<p>{this.props.app.getLicense() ? Parser.parseContent(this.props.app, this.props.app.getLicense()).toDOM() : "All rights reserved."}</p>

				<h2>Revisions</h2>
				
				<ul>
					{_map(this.props.app.getRevisions(), (revision, index) => {
						return <li key={"revision" + index}><em>{revision[0]}</em>. {Parser.parseContent(this.props.app, revision[1]).toDOM()}</li>;
					})}
				</ul>

			</div>
		);

	}

}

export {TableOfContents};