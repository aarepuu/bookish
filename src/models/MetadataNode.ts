import { Node } from "./Node";
import { FormattedNode } from "./FormattedNode";
import { TextNode } from "./TextNode";
import { Caret } from "./ChapterNode";
import { NodeType } from "./Parser";

export abstract class MetadataNode<MetaType> extends Node<FormattedNode> {

    #text: TextNode;
    #meta: MetaType;
    
    constructor(parent: FormattedNode, text: string, meta: MetaType, type: NodeType) {
        super(parent, type);
        this.#text = new TextNode(this, text, 0);
        this.#meta = meta;
    }

    getMeta() { return this.#meta }
    setMeta(meta: MetaType) { this.#meta = meta; }

    getText() { return this.#text; }
    setText(text: string) { this.#text = new TextNode(this, text, 0); }

    traverseChildren(fn: (node: Node) => void): void { this.#text.traverse(fn); }
    replaceChild(node: Node, replacement: Node): void {}
    getSiblingOf(child: Node, next: boolean) { return undefined; }

    removeChild(node: Node): void {
        if(node === this.#text)
            this.remove();
    }

    unwrap(): Caret | undefined {
        const parent = this.getParent();
        if(parent === undefined)
            return undefined;
        // Remember the text position of the text.
        const index = parent.caretToTextIndex({ node: this.#text, index: 0});
        // Replace this with it's text node.
        this.getParent()?.replaceChild(this, this.#text);
        // Return the corresponding caret position.
        return parent.textIndexToCaret(index);
    }

    clean() {
        if(this.#text.getLength() === 0)
            this.remove();
    }

    abstract toText(): string;
    abstract toBookdown(): String;
    abstract copy(parent: FormattedNode): MetadataNode<MetaType>;

}
