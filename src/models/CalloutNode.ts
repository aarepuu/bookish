import { BlocksNode } from "./BlocksNode";
import { ChapterNode } from "./ChapterNode";
import { Node } from "./Node";
import { BlockNode, BlockParentNode, Position } from "./Parser";

export class CalloutNode extends BlocksNode {
    
    #position: Position;

    constructor(parent: BlockParentNode, elements: BlockNode[]) {
        super(parent, elements, "callout");
        this.#position = "|";
    }

    getPosition() { return this.#position; }

    setPosition(position: Position) {
        this.#position = position;
    }

    toText(): string {
        return this.getBlocks().map(element => element.toText()).join(" ");
    }

    toBookdown(): string {
        return "=\n" + this.getBlocks().map(element => element.toText()).join("\n\n") + "\n=" + (this.#position !== "|" ? this.#position : "");
    }

    traverseChildren(fn: (node: Node) => void): void {
        this.getBlocks().forEach(item => item.traverse(fn) )
    }

    getSiblingOf(child: Node, next: boolean) {
        return this.getBlocks()[this.getBlocks().indexOf(child as BlockNode) + (next ? 1 : -1)];
    }

    copy(parent: BlockParentNode): CalloutNode {
        const els: BlockNode[] = []
        const node = new CalloutNode(parent, els)
        node.setPosition(this.#position)
        this.getBlocks().forEach(e => els.push(e.copy(node as unknown as BlockParentNode)));
        return node;
    }

}
