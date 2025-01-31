import React from 'react';

import Header from "./Header";
import Outline from './Outline';
import Page from './Page';
import Book from '../../models/Book'

const Unknown = (props: { book: Book, message: React.ReactNode }) => {

	return (
		<Page>
			<Header 
				book={props.book}
				label="Unknown page title"
				image={props.book.getImage("unknown") } 
				header="Oops."
				outline={
					<Outline
						previous={null}
						next={null}
					/>
				}
			/>
			<p>{props.message}</p>
		</Page>
	)

}

export default Unknown;